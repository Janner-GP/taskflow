#Requires -Version 5.1
# =============================================================================
# TaskFlow — Provisioning de infraestructura AWS (Windows PowerShell)
#
# Equivalente nativo de aws/setup.sh para ejecutar sin WSL ni bash.
#
# Arquitectura:
#   Internet → ALB (subredes públicas)
#            ├─► Web ECS Fargate     (subredes públicas)
#            └─► Backend ECS Fargate (subredes públicas)
#                     └─► RDS PostgreSQL (subredes PRIVADAS)
#                     └─► Secrets Manager
#
# Uso (desde la raíz del proyecto):
#   .\aws\setup.ps1
#
# Requiere:
#   - AWS CLI v2 instalado (winget install Amazon.AWSCLI)
#   - aws configure con las credenciales del usuario de deploy
#   - .env en la raíz del proyecto con todos los valores rellenos
#
# Idempotente: puede re-ejecutarse sin romper recursos existentes.
# =============================================================================

Set-StrictMode -Version Latest

# =============================================================================
# 0. Cargar .env
# =============================================================================
$envFile = Join-Path $PSScriptRoot "..\.env"
if (-not (Test-Path $envFile)) {
    Write-Error "ERROR: .env no encontrado en $envFile`nCopia .env.example a .env y rellena los valores."
    exit 1
}

Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith('#')) { return }
    $idx = $line.IndexOf('=')
    if ($idx -lt 0) { return }
    $k = $line.Substring(0, $idx).Trim()
    $v = $line.Substring($idx + 1).Trim()
    if (($v.StartsWith('"') -and $v.EndsWith('"')) -or
        ($v.StartsWith("'") -and $v.EndsWith("'"))) {
        $v = $v.Substring(1, $v.Length - 2)
    }
    [System.Environment]::SetEnvironmentVariable($k, $v, 'Process')
}

$region    = $env:AWS_REGION
$bucket    = $env:S3_BUCKET_NAME
$rdsId     = if ($env:RDS_INSTANCE_ID) { $env:RDS_INSTANCE_ID } else { 'taskflow-postgres' }
$rdsUser   = if ($env:RDS_USERNAME)    { $env:RDS_USERNAME }    else { 'postgres' }
$rdsPass   = $env:RDS_PASSWORD
$rdsDb     = if ($env:RDS_DB_NAME)     { $env:RDS_DB_NAME }     else { 'postgres' }
$cluster   = 'taskflow'
$secretName = 'taskflow/prod'
$vpcName   = 'taskflow'

if (-not $rdsPass) {
    Write-Error "ERROR: RDS_PASSWORD no definida en .env"
    exit 1
}

$accountId   = aws sts get-caller-identity --query Account --output text --region $region
$ecrRegistry = "$accountId.dkr.ecr.$region.amazonaws.com"

Write-Host "════════════════════════════════════════════════════"
Write-Host " Cuenta : $accountId"
Write-Host " Region : $region"
Write-Host " ECR    : $ecrRegistry"
Write-Host "════════════════════════════════════════════════════"

# =============================================================================
# Helpers
# =============================================================================
function IsEmpty($v) { [string]::IsNullOrEmpty($v) -or $v -eq 'None' }

# Escribe JSON a un archivo temporal y devuelve "file://ruta" para AWS CLI.
# IMPORTANTE: PowerShell 5.1 Set-Content -Encoding UTF8 añade BOM (U+FEFF) que
# el AWS CLI v2 rechaza con "Expected: '=', received: '﻿'".
# Se usa WriteAllText con UTF8Encoding(false) para garantizar UTF-8 SIN BOM.
function TempJson($json) {
    $f = [System.IO.Path]::GetTempFileName()
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($f, $json, $utf8NoBom)
    return "file://$($f -replace '\\', '/')"
}

# =============================================================================
# 1. VPC dedicada con subredes públicas (ALB+ECS) y privadas (RDS)
# =============================================================================
Write-Host "→ [1/11] VPC y subredes..."

$vpcId = aws ec2 describe-vpcs `
    --filters "Name=tag:Name,Values=$vpcName" `
    --query "Vpcs[0].VpcId" --output text --region $region
if (IsEmpty $vpcId) {
    $vpcId = aws ec2 create-vpc --cidr-block 10.0.0.0/16 `
        --query Vpc.VpcId --output text --region $region
    aws ec2 modify-vpc-attribute --vpc-id $vpcId `
        --enable-dns-hostnames --region $region | Out-Null
    aws ec2 create-tags --resources $vpcId `
        --tags Key=Name,Value=$vpcName --region $region | Out-Null
    Write-Host "  VPC creada: $vpcId"
} else {
    Write-Host "  VPC existente: $vpcId"
}

# Internet Gateway
$igwId = aws ec2 describe-internet-gateways `
    --filters "Name=attachment.vpc-id,Values=$vpcId" `
    --query "InternetGateways[0].InternetGatewayId" --output text --region $region
if (IsEmpty $igwId) {
    $igwId = aws ec2 create-internet-gateway `
        --query InternetGateway.InternetGatewayId --output text --region $region
    aws ec2 attach-internet-gateway `
        --internet-gateway-id $igwId --vpc-id $vpcId --region $region | Out-Null
    aws ec2 create-tags --resources $igwId `
        --tags Key=Name,Value="$vpcName-igw" --region $region | Out-Null
}

# Primeras 2 AZs disponibles
$azText = aws ec2 describe-availability-zones --region $region `
    --query "AvailabilityZones[?State=='available'].ZoneName" --output text
$azs = ($azText -split '\s+') | Where-Object { $_ } | Select-Object -First 2
$azA = $azs[0]; $azB = $azs[1]

function GetOrCreateSubnet($cidr, $az, $name) {
    $id = aws ec2 describe-subnets `
        --filters "Name=vpc-id,Values=$vpcId" "Name=cidrBlock,Values=$cidr" `
        --query "Subnets[0].SubnetId" --output text --region $region
    if (IsEmpty $id) {
        $id = aws ec2 create-subnet --vpc-id $vpcId --cidr-block $cidr `
            --availability-zone $az --query Subnet.SubnetId --output text --region $region
        aws ec2 create-tags --resources $id `
            --tags Key=Name,Value=$name --region $region | Out-Null
    }
    return $id
}

$pubA  = GetOrCreateSubnet '10.0.1.0/24' $azA "$vpcName-public-$azA"
$pubB  = GetOrCreateSubnet '10.0.2.0/24' $azB "$vpcName-public-$azB"
$privA = GetOrCreateSubnet '10.0.3.0/24' $azA "$vpcName-private-$azA"
$privB = GetOrCreateSubnet '10.0.4.0/24' $azB "$vpcName-private-$azB"

# Fargate en subred pública necesita IP pública para alcanzar ECR sin NAT Gateway
aws ec2 modify-subnet-attribute --subnet-id $pubA `
    --map-public-ip-on-launch --region $region 2>$null | Out-Null
aws ec2 modify-subnet-attribute --subnet-id $pubB `
    --map-public-ip-on-launch --region $region 2>$null | Out-Null

# Tabla de rutas pública → IGW
$pubRt = aws ec2 describe-route-tables `
    --filters "Name=vpc-id,Values=$vpcId" "Name=tag:Name,Values=$vpcName-rt-public" `
    --query "RouteTables[0].RouteTableId" --output text --region $region
if (IsEmpty $pubRt) {
    $pubRt = aws ec2 create-route-table --vpc-id $vpcId `
        --query RouteTable.RouteTableId --output text --region $region
    aws ec2 create-tags --resources $pubRt `
        --tags Key=Name,Value="$vpcName-rt-public" --region $region | Out-Null
    aws ec2 create-route --route-table-id $pubRt `
        --destination-cidr-block 0.0.0.0/0 `
        --gateway-id $igwId --region $region | Out-Null
}
aws ec2 associate-route-table --route-table-id $pubRt `
    --subnet-id $pubA --region $region 2>$null | Out-Null
aws ec2 associate-route-table --route-table-id $pubRt `
    --subnet-id $pubB --region $region 2>$null | Out-Null
# Las subredes privadas NO se asocian a esta tabla → sin ruta a IGW → RDS inaccesible desde internet

Write-Host "  Publicas  (ALB+ECS): $pubA ($azA)   $pubB ($azB)"
Write-Host "  Privadas  (RDS):     $privA ($azA)   $privB ($azB)"

# =============================================================================
# 2. S3 — bucket de adjuntos de tareas
# =============================================================================
Write-Host "→ [2/11] S3 bucket..."

# get-bucket-location funciona aunque el bucket esté en otra región; head-bucket no.
aws s3api get-bucket-location --bucket $bucket --output text 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    aws s3api create-bucket --bucket $bucket --region $region `
        --create-bucket-configuration LocationConstraint=$region | Out-Null
}

# Las operaciones de configuración de bucket no necesitan --region (S3 es global)
aws s3api put-public-access-block --bucket $bucket `
    --public-access-block-configuration `
    'BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false' | Out-Null

$bucketPolicyJson = @"
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "PublicReadAttachments",
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::$bucket/tasks/*"
  }]
}
"@
aws s3api put-bucket-policy --bucket $bucket `
    --policy (TempJson $bucketPolicyJson) | Out-Null

$corsJson = @'
{"CORSRules":[{"AllowedOrigins":["*"],"AllowedMethods":["GET"],"AllowedHeaders":["*"],"MaxAgeSeconds":86400}]}
'@
aws s3api put-bucket-cors --bucket $bucket `
    --cors-configuration (TempJson $corsJson) | Out-Null

Write-Host "  OK — s3://$bucket"

# =============================================================================
# 3. ECR — repos de imágenes
# =============================================================================
Write-Host "→ [3/11] ECR repos..."

foreach ($repo in @('taskflow-backend', 'taskflow-web')) {
    aws ecr describe-repositories --repository-names $repo `
        --region $region 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        aws ecr create-repository --repository-name $repo `
            --image-scanning-configuration scanOnPush=true `
            --region $region | Out-Null
    }
    Write-Host "  OK — $ecrRegistry/$repo"
}

# =============================================================================
# 4. IAM — execution role con permiso para leer Secrets Manager
# =============================================================================
Write-Host "→ [4/11] IAM execution role..."

$trustJson = @'
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]}
'@

$execRoleArn = aws iam get-role --role-name taskflow-ecs-execution-role `
    --query Role.Arn --output text 2>$null
if ($LASTEXITCODE -ne 0) {
    $execRoleArn = aws iam create-role --role-name taskflow-ecs-execution-role `
        --assume-role-policy-document (TempJson $trustJson) `
        --query Role.Arn --output text
}

aws iam attach-role-policy --role-name taskflow-ecs-execution-role `
    --policy-arn 'arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy' `
    2>$null | Out-Null

$smPolicyJson = @"
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["secretsmanager:GetSecretValue"],
    "Resource": "arn:aws:secretsmanager:${region}:${accountId}:secret:taskflow/prod*"
  }]
}
"@
aws iam put-role-policy --role-name taskflow-ecs-execution-role `
    --policy-name taskflow-read-secrets-manager `
    --policy-document (TempJson $smPolicyJson) | Out-Null

Write-Host "  OK — $execRoleArn"

# =============================================================================
# 5. Secrets Manager — secreto de producción
# =============================================================================
Write-Host "→ [5/11] Secrets Manager..."

$secretArn = aws secretsmanager describe-secret --secret-id $secretName `
    --query ARN --output text --region $region 2>$null
if ($LASTEXITCODE -ne 0) {
    $secretArn = aws secretsmanager create-secret `
        --name $secretName `
        --description "TaskFlow secretos de produccion. Actualizado por CI/CD en cada deploy." `
        --secret-string '{"_note":"CI/CD actualiza este valor en el primer push a main"}' `
        --region $region --query ARN --output text
    Write-Host "  creado: $secretArn"
} else {
    Write-Host "  ya existe: $secretArn"
}

# =============================================================================
# 6. Security Groups
# =============================================================================
Write-Host "→ [6/11] Security groups..."

function GetOrCreateSg($name, $desc) {
    $id = aws ec2 describe-security-groups `
        --filters "Name=group-name,Values=$name" "Name=vpc-id,Values=$vpcId" `
        --query "SecurityGroups[0].GroupId" --output text --region $region
    if (IsEmpty $id) {
        $id = aws ec2 create-security-group `
            --group-name $name --description $desc `
            --vpc-id $vpcId --region $region --query GroupId --output text
    }
    return $id
}

$albSg     = GetOrCreateSg 'taskflow-alb-sg'     'TaskFlow ALB publico'
$webSg     = GetOrCreateSg 'taskflow-web-sg'     'TaskFlow Web ECS'
$backendSg = GetOrCreateSg 'taskflow-backend-sg' 'TaskFlow Backend ECS'
$rdsSg     = GetOrCreateSg 'taskflow-rds-sg'     'TaskFlow RDS solo desde Backend ECS'

# Ingress
aws ec2 authorize-security-group-ingress --group-id $albSg `
    --protocol tcp --port 80 --cidr 0.0.0.0/0 --region $region 2>$null | Out-Null
aws ec2 authorize-security-group-ingress --group-id $webSg `
    --protocol tcp --port 80 --source-group $albSg --region $region 2>$null | Out-Null
aws ec2 authorize-security-group-ingress --group-id $backendSg `
    --protocol tcp --port 3000 --source-group $albSg --region $region 2>$null | Out-Null
# RDS: puerto 5432 solo desde backend ECS
aws ec2 authorize-security-group-ingress --group-id $rdsSg `
    --protocol tcp --port 5432 --source-group $backendSg --region $region 2>$null | Out-Null

# Egress: todo saliente para ECS (ECR, Secrets Manager, S3)
$egressRef = TempJson '[{"IpProtocol":"-1","IpRanges":[{"CidrIp":"0.0.0.0/0"}]}]'
foreach ($sg in @($albSg, $webSg, $backendSg)) {
    aws ec2 authorize-security-group-egress --group-id $sg `
        --ip-permissions $egressRef --region $region 2>$null | Out-Null
}

Write-Host "  ALB: $albSg | Web: $webSg | Backend: $backendSg | RDS: $rdsSg"

# =============================================================================
# 7. RDS PostgreSQL — subredes privadas (sin acceso desde internet)
# =============================================================================
Write-Host "→ [7/11] RDS PostgreSQL..."

$dbSubnetGroup = 'taskflow-db-subnet'
aws rds describe-db-subnet-groups `
    --db-subnet-group-name $dbSubnetGroup --region $region 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    aws rds create-db-subnet-group `
        --db-subnet-group-name $dbSubnetGroup `
        --db-subnet-group-description "TaskFlow subredes privadas para PostgreSQL" `
        --subnet-ids $privA $privB `
        --region $region | Out-Null
}

$rdsCurrentVpc = aws rds describe-db-instances `
    --db-instance-identifier $rdsId `
    --query "DBInstances[0].DBSubnetGroup.VpcId" --output text `
    --region $region 2>$null
$rdsExists = ($LASTEXITCODE -eq 0)

if (-not $rdsExists -or (IsEmpty $rdsCurrentVpc)) {
    Write-Host "  Creando instancia $rdsId en subredes privadas..."
    aws rds create-db-instance `
        --db-instance-identifier $rdsId `
        --db-instance-class db.t3.micro `
        --engine postgres `
        --engine-version "16" `
        --master-username $rdsUser `
        --master-user-password $rdsPass `
        --db-name $rdsDb `
        --vpc-security-group-ids $rdsSg `
        --db-subnet-group-name $dbSubnetGroup `
        --no-publicly-accessible `
        --storage-type gp2 `
        --allocated-storage 20 `
        --backup-retention-period 7 `
        --deletion-protection `
        --region $region | Out-Null
    Write-Host "  Creando (aprox. 5 min). Verifica el estado con:"
    Write-Host "    aws rds describe-db-instances --db-instance-identifier $rdsId --query 'DBInstances[0].DBInstanceStatus' --region $region"
    $rdsEndpoint = "<pendiente — disponible en ~5 min>"
} elseif ($rdsCurrentVpc -eq $vpcId) {
    Write-Host "  Ya existe en la VPC taskflow. Actualizando SG y acceso publico..."
    aws rds modify-db-instance --db-instance-identifier $rdsId `
        --vpc-security-group-ids $rdsSg `
        --no-publicly-accessible `
        --apply-immediately --region $region 2>$null | Out-Null
    $rdsEndpoint = aws rds describe-db-instances --db-instance-identifier $rdsId `
        --query "DBInstances[0].Endpoint.Address" --output text --region $region
} else {
    Write-Host ""
    Write-Host "  AVISO: $rdsId existe en VPC $rdsCurrentVpc (distinta a la VPC taskflow $vpcId)."
    Write-Host "  Las tasks ECS no pueden alcanzarla directamente. Opciones:"
    Write-Host "    A) Eliminar la instancia y re-ejecutar este script para crearla en subredes privadas."
    Write-Host "       aws rds delete-db-instance --db-instance-identifier $rdsId --skip-final-snapshot --region $region"
    Write-Host "       aws rds wait db-instance-deleted --db-instance-identifier $rdsId --region $region"
    Write-Host "    B) Configurar VPC Peering entre $vpcId y $rdsCurrentVpc."
    $rdsEndpoint = aws rds describe-db-instances --db-instance-identifier $rdsId `
        --query "DBInstances[0].Endpoint.Address" --output text --region $region 2>$null
    if (IsEmpty $rdsEndpoint) { $rdsEndpoint = "<ver aviso arriba>" }
}

Write-Host "  RDS: $rdsEndpoint"

# =============================================================================
# 8. ECS Cluster
# =============================================================================
Write-Host "→ [8/11] ECS cluster..."
aws ecs create-cluster --cluster-name $cluster --region $region 2>$null | Out-Null
Write-Host "  OK — $cluster"

# =============================================================================
# 9. CloudWatch Log Groups
# =============================================================================
Write-Host "→ [9/11] CloudWatch log groups..."
aws logs create-log-group --log-group-name /ecs/taskflow-backend --region $region 2>$null | Out-Null
aws logs create-log-group --log-group-name /ecs/taskflow-web     --region $region 2>$null | Out-Null

# =============================================================================
# 10. ALB — solo subredes públicas
# =============================================================================
Write-Host "→ [10/11] ALB..."

$albArn = aws elbv2 describe-load-balancers --names taskflow-alb `
    --query "LoadBalancers[0].LoadBalancerArn" --output text --region $region 2>$null
if ($LASTEXITCODE -ne 0 -or (IsEmpty $albArn)) {
    $albArn = aws elbv2 create-load-balancer --name taskflow-alb `
        --subnets $pubA $pubB --security-groups $albSg `
        --query "LoadBalancers[0].LoadBalancerArn" --output text --region $region
}

$albDns = aws elbv2 describe-load-balancers --load-balancer-arns $albArn `
    --query "LoadBalancers[0].DNSName" --output text --region $region

$backendTgArn = aws elbv2 describe-target-groups --names taskflow-backend-tg `
    --query "TargetGroups[0].TargetGroupArn" --output text --region $region 2>$null
if ($LASTEXITCODE -ne 0 -or (IsEmpty $backendTgArn)) {
    $backendTgArn = aws elbv2 create-target-group --name taskflow-backend-tg `
        --protocol HTTP --port 3000 --vpc-id $vpcId --target-type ip `
        --health-check-path /api/health --health-check-interval-seconds 30 `
        --query "TargetGroups[0].TargetGroupArn" --output text --region $region
}

$webTgArn = aws elbv2 describe-target-groups --names taskflow-web-tg `
    --query "TargetGroups[0].TargetGroupArn" --output text --region $region 2>$null
if ($LASTEXITCODE -ne 0 -or (IsEmpty $webTgArn)) {
    $webTgArn = aws elbv2 create-target-group --name taskflow-web-tg `
        --protocol HTTP --port 80 --vpc-id $vpcId --target-type ip `
        --health-check-path / --health-check-interval-seconds 30 `
        --query "TargetGroups[0].TargetGroupArn" --output text --region $region
}

$listenerArn = aws elbv2 describe-listeners --load-balancer-arn $albArn `
    --query "Listeners[0].ListenerArn" --output text --region $region 2>$null
if ($LASTEXITCODE -ne 0 -or (IsEmpty $listenerArn)) {
    $listenerArn = aws elbv2 create-listener `
        --load-balancer-arn $albArn --protocol HTTP --port 80 `
        --default-actions "Type=forward,TargetGroupArn=$webTgArn" `
        --query "Listeners[0].ListenerArn" --output text --region $region
}

$apiRuleConditions = TempJson '[{"Field":"path-pattern","Values":["/api/*"]}]'
aws elbv2 create-rule --listener-arn $listenerArn `
    --conditions $apiRuleConditions --priority 10 `
    --actions "Type=forward,TargetGroupArn=$backendTgArn" `
    --region $region 2>$null | Out-Null

Write-Host "  ALB DNS: $albDns"

# =============================================================================
# 11. ECS placeholder task defs + services
# =============================================================================
Write-Host "→ [11/11] ECS services..."

function RegisterPlaceholderTd($family, $container, $port, $cpu, $mem) {
    aws ecs describe-task-definition --task-definition $family `
        --region $region 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { return }

    $containerJson = @"
[{
  "name": "$container",
  "image": "public.ecr.aws/nginx/nginx:stable-alpine",
  "portMappings": [{"containerPort": $port, "protocol": "tcp"}],
  "logConfiguration": {
    "logDriver": "awslogs",
    "options": {
      "awslogs-group": "/ecs/$family",
      "awslogs-region": "$region",
      "awslogs-stream-prefix": "ecs"
    }
  },
  "essential": true
}]
"@
    aws ecs register-task-definition `
        --family $family `
        --network-mode awsvpc `
        --requires-compatibilities FARGATE `
        --cpu $cpu --memory $mem `
        --execution-role-arn $execRoleArn `
        --container-definitions (TempJson $containerJson) `
        --region $region | Out-Null
}

RegisterPlaceholderTd 'taskflow-backend' 'backend' 3000 512 1024
RegisterPlaceholderTd 'taskflow-web'     'web'      80  256  512

# Los corchetes necesitan escape en PowerShell dentro de strings dobles
$pubSubnetsJson = "[`"$pubA`",`"$pubB`"]"

function CreateServiceIfMissing($name, $td, $sg, $tgArn, $container, $port) {
    $existing = aws ecs describe-services --cluster $cluster --services $name `
        --query "services[?status=='ACTIVE'].serviceName" --output text `
        --region $region 2>$null
    if (-not (IsEmpty $existing) -and $existing -like "*$name*") {
        Write-Host "  ya existe: $name"
        return
    }
    $svcOut = aws ecs create-service `
        --cluster $cluster --service-name $name `
        --task-definition $td --desired-count 1 `
        --launch-type FARGATE `
        --network-configuration "awsvpcConfiguration={subnets=$pubSubnetsJson,securityGroups=[`"$sg`"],assignPublicIp=ENABLED}" `
        --load-balancers "targetGroupArn=$tgArn,containerName=$container,containerPort=$port" `
        --health-check-grace-period-seconds 60 `
        --region $region 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  creado: $name"
    } else {
        Write-Host "  ERROR al crear $name`: $svcOut"
    }
}

CreateServiceIfMissing 'taskflow-backend' 'taskflow-backend' $backendSg $backendTgArn 'backend' 3000
CreateServiceIfMissing 'taskflow-web'     'taskflow-web'     $webSg     $webTgArn     'web'      80

# =============================================================================
# Resumen final
# =============================================================================
Write-Host ""
Write-Host "════════════════════════════════════════════════════════════════════"
Write-Host "  Infraestructura lista."
Write-Host "════════════════════════════════════════════════════════════════════"
Write-Host "  VPC      : $vpcId (10.0.0.0/16)"
Write-Host "  Publicas : $pubA ($azA)  $pubB ($azB)"
Write-Host "  Privadas : $privA ($azA)  $privB ($azB)"
Write-Host "  RDS      : $rdsEndpoint"
Write-Host "  Secret   : $secretArn"
Write-Host "  ALB      : http://$albDns"
Write-Host ""
Write-Host "  GitHub Secrets (repo → Settings → Secrets → Actions):"
Write-Host ""
Write-Host "  AWS_REGION              = $region"
Write-Host "  AWS_ACCOUNT_ID          = $accountId"
Write-Host "  AWS_ACCESS_KEY_ID       = <clave IAM del usuario de deploy>"
Write-Host "  AWS_SECRET_ACCESS_KEY   = <secreto IAM del usuario de deploy>"
Write-Host "  DATABASE_URL            = postgresql://${rdsUser}:<password>@${rdsEndpoint}:5432/${rdsDb}?schema=public"
Write-Host "  JWT_ACCESS_SECRET       = <ver comando abajo>"
Write-Host "  JWT_REFRESH_SECRET      = <ver comando abajo>"
Write-Host "  COOKIE_SECRET           = <ver comando abajo>"
Write-Host "  S3_BUCKET_NAME          = $bucket"
Write-Host "  CORS_ORIGIN             = http://$albDns"
Write-Host "  APP_PUBLIC_URL          = http://$albDns"
Write-Host ""
Write-Host "  Genera los 3 secretos JWT/cookie en PowerShell:"
Write-Host "    [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))"
Write-Host ""
Write-Host "  Haz push a main para el primer despliegue."
Write-Host "════════════════════════════════════════════════════════════════════"
