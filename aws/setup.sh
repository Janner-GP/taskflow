#!/usr/bin/env bash
# =============================================================================
# TaskFlow — Provisioning de infraestructura AWS
#
# Arquitectura:
#   Internet → ALB (subredes públicas)
#            ├─► Web ECS Fargate     (subredes públicas)
#            └─► Backend ECS Fargate (subredes públicas)
#                     └─► RDS PostgreSQL (subredes PRIVADAS — sin ruta a IGW)
#                     └─► Secrets Manager (via API pública con IAM)
#
# VPC dedicada 10.0.0.0/16:
#   Públicas:  10.0.1.0/24, 10.0.2.0/24  — ALB + ECS Fargate (assignPublicIp=ENABLED)
#   Privadas:  10.0.3.0/24, 10.0.4.0/24  — RDS (sin ruta a Internet Gateway)
#
# Security groups:
#   ALB SG:     80   ← 0.0.0.0/0
#   Web SG:     80   ← ALB SG
#   Backend SG: 3000 ← ALB SG
#   RDS SG:     5432 ← Backend SG ÚNICAMENTE
#
# Uso (desde la raíz del proyecto):
#   bash aws/setup.sh
#
# Requiere:
#   - AWS CLI v2 en PATH
#   - .env con AWS_REGION, S3_BUCKET_NAME, RDS_PASSWORD y las vars de la app
#   - Permisos IAM: ECS, ECR, ELBv2, EC2, RDS, IAM, S3, SecretsManager, Logs
#
# Idempotente: puede re-ejecutarse sin romper recursos existentes.
# =============================================================================
set -euo pipefail

ENV_FILE="$(dirname "$0")/../.env"
[[ -f "$ENV_FILE" ]] || { echo "ERROR: .env no encontrado en $ENV_FILE"; exit 1; }
set -a; source "$ENV_FILE"; set +a

CLUSTER="taskflow"
SECRET_NAME="taskflow/prod"
VPC_NAME="taskflow"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text --region "$AWS_REGION")
ECR_REGISTRY="$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

echo "════════════════════════════════════════════════════"
echo " Cuenta : $ACCOUNT_ID"
echo " Región : $AWS_REGION"
echo " ECR    : $ECR_REGISTRY"
echo "════════════════════════════════════════════════════"

# =============================================================================
# 1. VPC dedicada con subredes públicas (ECS/ALB) y privadas (RDS)
# =============================================================================
echo "→ [1/11] VPC y subredes..."

VPC_ID=$(aws ec2 describe-vpcs \
  --filters "Name=tag:Name,Values=$VPC_NAME" \
  --query "Vpcs[0].VpcId" --output text --region "$AWS_REGION")
if [[ "$VPC_ID" == "None" || -z "$VPC_ID" ]]; then
  VPC_ID=$(aws ec2 create-vpc \
    --cidr-block 10.0.0.0/16 \
    --query Vpc.VpcId --output text --region "$AWS_REGION")
  aws ec2 modify-vpc-attribute --vpc-id "$VPC_ID" \
    --enable-dns-hostnames --region "$AWS_REGION"
  aws ec2 create-tags --resources "$VPC_ID" \
    --tags Key=Name,Value="$VPC_NAME" --region "$AWS_REGION"
  echo "  VPC creada: $VPC_ID"
else
  echo "  VPC existente: $VPC_ID"
fi

# Internet Gateway
IGW_ID=$(aws ec2 describe-internet-gateways \
  --filters "Name=attachment.vpc-id,Values=$VPC_ID" \
  --query "InternetGateways[0].InternetGatewayId" --output text --region "$AWS_REGION")
if [[ "$IGW_ID" == "None" || -z "$IGW_ID" ]]; then
  IGW_ID=$(aws ec2 create-internet-gateway \
    --query InternetGateway.InternetGatewayId --output text --region "$AWS_REGION")
  aws ec2 attach-internet-gateway \
    --internet-gateway-id "$IGW_ID" --vpc-id "$VPC_ID" --region "$AWS_REGION"
  aws ec2 create-tags --resources "$IGW_ID" \
    --tags Key=Name,Value="$VPC_NAME-igw" --region "$AWS_REGION"
fi

# 2 AZs disponibles
readarray -t AZS < <(aws ec2 describe-availability-zones \
  --region "$AWS_REGION" \
  --query "AvailabilityZones[?State=='available'].ZoneName" \
  --output text | tr '\t' '\n' | head -2)
AZ_A="${AZS[0]}"; AZ_B="${AZS[1]}"

_get_or_create_subnet() {
  local cidr="$1" az="$2" name="$3"
  local id
  id=$(aws ec2 describe-subnets \
    --filters "Name=vpc-id,Values=$VPC_ID" "Name=cidrBlock,Values=$cidr" \
    --query "Subnets[0].SubnetId" --output text --region "$AWS_REGION")
  if [[ "$id" == "None" || -z "$id" ]]; then
    id=$(aws ec2 create-subnet \
      --vpc-id "$VPC_ID" --cidr-block "$cidr" --availability-zone "$az" \
      --query Subnet.SubnetId --output text --region "$AWS_REGION")
    aws ec2 create-tags --resources "$id" \
      --tags Key=Name,Value="$name" --region "$AWS_REGION"
  fi
  echo "$id"
}

PUB_A=$(_get_or_create_subnet 10.0.1.0/24 "$AZ_A" "$VPC_NAME-public-$AZ_A")
PUB_B=$(_get_or_create_subnet 10.0.2.0/24 "$AZ_B" "$VPC_NAME-public-$AZ_B")
PRIV_A=$(_get_or_create_subnet 10.0.3.0/24 "$AZ_A" "$VPC_NAME-private-$AZ_A")
PRIV_B=$(_get_or_create_subnet 10.0.4.0/24 "$AZ_B" "$VPC_NAME-private-$AZ_B")

# Fargate en subredes públicas necesita IP pública para llamar a ECR sin NAT Gateway
aws ec2 modify-subnet-attribute --subnet-id "$PUB_A" \
  --map-public-ip-on-launch --region "$AWS_REGION" 2>/dev/null || true
aws ec2 modify-subnet-attribute --subnet-id "$PUB_B" \
  --map-public-ip-on-launch --region "$AWS_REGION" 2>/dev/null || true

# Tabla de rutas pública → IGW
PUB_RT=$(aws ec2 describe-route-tables \
  --filters "Name=vpc-id,Values=$VPC_ID" "Name=tag:Name,Values=$VPC_NAME-rt-public" \
  --query "RouteTables[0].RouteTableId" --output text --region "$AWS_REGION")
if [[ "$PUB_RT" == "None" || -z "$PUB_RT" ]]; then
  PUB_RT=$(aws ec2 create-route-table \
    --vpc-id "$VPC_ID" --query RouteTable.RouteTableId --output text --region "$AWS_REGION")
  aws ec2 create-tags --resources "$PUB_RT" \
    --tags Key=Name,Value="$VPC_NAME-rt-public" --region "$AWS_REGION"
  aws ec2 create-route \
    --route-table-id "$PUB_RT" --destination-cidr-block 0.0.0.0/0 \
    --gateway-id "$IGW_ID" --region "$AWS_REGION" > /dev/null
fi
aws ec2 associate-route-table \
  --route-table-id "$PUB_RT" --subnet-id "$PUB_A" --region "$AWS_REGION" 2>/dev/null || true
aws ec2 associate-route-table \
  --route-table-id "$PUB_RT" --subnet-id "$PUB_B" --region "$AWS_REGION" 2>/dev/null || true
# Las subredes privadas NO se asocian a esta tabla → sin ruta al IGW → RDS inaccesible desde internet

echo "  Públicas  (ALB + ECS): $PUB_A  ($AZ_A)  $PUB_B  ($AZ_B)"
echo "  Privadas  (RDS):       $PRIV_A ($AZ_A)  $PRIV_B ($AZ_B)"

# =============================================================================
# 2. S3 — bucket de adjuntos de tareas
# =============================================================================
echo "→ [2/11] S3 bucket..."
if ! aws s3api head-bucket --bucket "$S3_BUCKET_NAME" --region "$AWS_REGION" 2>/dev/null; then
  aws s3api create-bucket \
    --bucket "$S3_BUCKET_NAME" \
    --region "$AWS_REGION" \
    --create-bucket-configuration LocationConstraint="$AWS_REGION"
fi
aws s3api put-public-access-block --bucket "$S3_BUCKET_NAME" \
  --public-access-block-configuration \
  BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false
aws s3api put-bucket-policy --bucket "$S3_BUCKET_NAME" --policy "{
  \"Version\":\"2012-10-17\",
  \"Statement\":[{
    \"Sid\":\"PublicReadAttachments\",
    \"Effect\":\"Allow\",
    \"Principal\":\"*\",
    \"Action\":\"s3:GetObject\",
    \"Resource\":\"arn:aws:s3:::${S3_BUCKET_NAME}/tasks/*\"
  }]
}"
aws s3api put-bucket-cors --bucket "$S3_BUCKET_NAME" --cors-configuration '{
  "CORSRules":[{"AllowedOrigins":["*"],"AllowedMethods":["GET"],"AllowedHeaders":["*"],"MaxAgeSeconds":86400}]
}'
echo "  OK — s3://$S3_BUCKET_NAME"

# =============================================================================
# 3. ECR — repos de imágenes
# =============================================================================
echo "→ [3/11] ECR repos..."
for repo in taskflow-backend taskflow-web; do
  aws ecr describe-repositories --repository-names "$repo" \
    --region "$AWS_REGION" &>/dev/null \
  || aws ecr create-repository --repository-name "$repo" \
       --image-scanning-configuration scanOnPush=true \
       --region "$AWS_REGION" > /dev/null
  echo "  OK — $ECR_REGISTRY/$repo"
done

# =============================================================================
# 4. IAM — execution role con permiso para leer Secrets Manager
#    El ECS agent usa este role para inyectar los `secrets` en el contenedor
#    durante el startup de la task, antes de que la app arranque.
# =============================================================================
echo "→ [4/11] IAM execution role..."
TRUST='{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]}'

EXEC_ROLE_ARN=$(aws iam get-role \
  --role-name taskflow-ecs-execution-role \
  --query Role.Arn --output text 2>/dev/null) \
|| EXEC_ROLE_ARN=$(aws iam create-role \
    --role-name taskflow-ecs-execution-role \
    --assume-role-policy-document "$TRUST" \
    --query Role.Arn --output text)

aws iam attach-role-policy \
  --role-name taskflow-ecs-execution-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy \
  2>/dev/null || true

aws iam put-role-policy \
  --role-name taskflow-ecs-execution-role \
  --policy-name taskflow-read-secrets-manager \
  --policy-document "{
    \"Version\":\"2012-10-17\",
    \"Statement\":[{
      \"Effect\":\"Allow\",
      \"Action\":[\"secretsmanager:GetSecretValue\"],
      \"Resource\":\"arn:aws:secretsmanager:${AWS_REGION}:${ACCOUNT_ID}:secret:taskflow/prod*\"
    }]
  }"

echo "  OK — $EXEC_ROLE_ARN"

# =============================================================================
# 5. Secrets Manager — secreto de producción
#    El CI/CD actualiza el valor en cada deploy con los datos de GitHub Secrets.
#    La task definition referencia las claves individuales del JSON.
# =============================================================================
echo "→ [5/11] Secrets Manager..."
SECRET_ARN=$(aws secretsmanager describe-secret \
  --secret-id "$SECRET_NAME" --region "$AWS_REGION" \
  --query ARN --output text 2>/dev/null) || SECRET_ARN=""

if [[ -z "$SECRET_ARN" || "$SECRET_ARN" == "None" ]]; then
  SECRET_ARN=$(aws secretsmanager create-secret \
    --name "$SECRET_NAME" \
    --description "TaskFlow — secretos de producción. Actualizado por CI/CD en cada deploy." \
    --secret-string '{"_note":"CI/CD actualiza este valor en el primer push a main"}' \
    --region "$AWS_REGION" \
    --query ARN --output text)
  echo "  creado: $SECRET_ARN"
else
  echo "  ya existe: $SECRET_ARN"
fi

# =============================================================================
# 6. Security Groups
# =============================================================================
echo "→ [6/11] Security groups..."

_get_or_create_sg() {
  local name="$1" desc="$2"
  local id
  id=$(aws ec2 describe-security-groups \
    --filters "Name=group-name,Values=$name" "Name=vpc-id,Values=$VPC_ID" \
    --query "SecurityGroups[0].GroupId" --output text \
    --region "$AWS_REGION" 2>/dev/null)
  if [[ "$id" == "None" || -z "$id" ]]; then
    id=$(aws ec2 create-security-group \
      --group-name "$name" --description "$desc" \
      --vpc-id "$VPC_ID" --region "$AWS_REGION" \
      --query GroupId --output text)
  fi
  echo "$id"
}

ALB_SG=$(_get_or_create_sg     taskflow-alb-sg     "TaskFlow ALB — publico")
WEB_SG=$(_get_or_create_sg     taskflow-web-sg     "TaskFlow Web ECS")
BACKEND_SG=$(_get_or_create_sg taskflow-backend-sg "TaskFlow Backend ECS")
RDS_SG=$(_get_or_create_sg     taskflow-rds-sg     "TaskFlow RDS — solo desde Backend ECS")

# ALB: 80 desde internet
aws ec2 authorize-security-group-ingress --group-id "$ALB_SG" \
  --protocol tcp --port 80 --cidr 0.0.0.0/0 --region "$AWS_REGION" 2>/dev/null || true
# Web ECS: 80 solo desde ALB
aws ec2 authorize-security-group-ingress --group-id "$WEB_SG" \
  --protocol tcp --port 80 --source-group "$ALB_SG" --region "$AWS_REGION" 2>/dev/null || true
# Backend ECS: 3000 solo desde ALB
aws ec2 authorize-security-group-ingress --group-id "$BACKEND_SG" \
  --protocol tcp --port 3000 --source-group "$ALB_SG" --region "$AWS_REGION" 2>/dev/null || true
# RDS: 5432 SOLO desde backend ECS — doble barrera: subred privada + SG restrictivo
aws ec2 authorize-security-group-ingress --group-id "$RDS_SG" \
  --protocol tcp --port 5432 --source-group "$BACKEND_SG" --region "$AWS_REGION" 2>/dev/null || true

# ECS y ALB necesitan salida a internet (ECR, Secrets Manager, S3)
for sg in "$ALB_SG" "$WEB_SG" "$BACKEND_SG"; do
  aws ec2 authorize-security-group-egress --group-id "$sg" \
    --protocol -1 --port all --cidr 0.0.0.0/0 --region "$AWS_REGION" 2>/dev/null || true
done

echo "  ALB: $ALB_SG | Web: $WEB_SG | Backend: $BACKEND_SG | RDS: $RDS_SG"

# =============================================================================
# 7. RDS PostgreSQL — subredes privadas (sin acceso desde internet)
# =============================================================================
echo "→ [7/11] RDS PostgreSQL..."

DB_SUBNET_GROUP="taskflow-db-subnet"
aws rds describe-db-subnet-groups \
  --db-subnet-group-name "$DB_SUBNET_GROUP" --region "$AWS_REGION" &>/dev/null \
|| aws rds create-db-subnet-group \
    --db-subnet-group-name "$DB_SUBNET_GROUP" \
    --db-subnet-group-description "TaskFlow — subredes privadas para PostgreSQL" \
    --subnet-ids "$PRIV_A" "$PRIV_B" \
    --region "$AWS_REGION" > /dev/null

RDS_ID="${RDS_INSTANCE_ID:-taskflow-postgres}"
RDS_CURRENT_VPC=$(aws rds describe-db-instances \
  --db-instance-identifier "$RDS_ID" \
  --query "DBInstances[0].DBSubnetGroup.VpcId" --output text \
  --region "$AWS_REGION" 2>/dev/null) || RDS_CURRENT_VPC=""

if [[ -z "$RDS_CURRENT_VPC" || "$RDS_CURRENT_VPC" == "None" ]]; then
  echo "  Creando instancia $RDS_ID en subredes privadas..."
  aws rds create-db-instance \
    --db-instance-identifier "$RDS_ID" \
    --db-instance-class db.t3.micro \
    --engine postgres \
    --engine-version "16" \
    --master-username "${RDS_USERNAME:-postgres}" \
    --master-user-password "${RDS_PASSWORD:?RDS_PASSWORD no definida en .env}" \
    --db-name "${RDS_DB_NAME:-postgres}" \
    --vpc-security-group-ids "$RDS_SG" \
    --db-subnet-group-name "$DB_SUBNET_GROUP" \
    --no-publicly-accessible \
    --storage-type gp2 \
    --allocated-storage 20 \
    --backup-retention-period 7 \
    --deletion-protection \
    --region "$AWS_REGION" > /dev/null
  echo "  Creando (≈5 min). Verifica con:"
  echo "    aws rds describe-db-instances --db-instance-identifier $RDS_ID --query 'DBInstances[0].DBInstanceStatus'"
  RDS_ENDPOINT="<pendiente — disponible en ~5 min>"
elif [[ "$RDS_CURRENT_VPC" == "$VPC_ID" ]]; then
  echo "  Ya existe en la VPC de TaskFlow. Actualizando SG y visibilidad..."
  aws rds modify-db-instance \
    --db-instance-identifier "$RDS_ID" \
    --vpc-security-group-ids "$RDS_SG" \
    --no-publicly-accessible \
    --apply-immediately \
    --region "$AWS_REGION" > /dev/null || true
  RDS_ENDPOINT=$(aws rds describe-db-instances \
    --db-instance-identifier "$RDS_ID" \
    --query "DBInstances[0].Endpoint.Address" --output text --region "$AWS_REGION")
else
  echo "  AVISO: $RDS_ID existe en VPC $RDS_CURRENT_VPC (distinta a la VPC taskflow $VPC_ID)."
  echo "  Las tasks de ECS no pueden alcanzarla directamente. Opciones:"
  echo "    A) Eliminar la instancia existente y re-ejecutar setup.sh para crearla en subredes privadas."
  echo "    B) Configurar VPC Peering entre $VPC_ID y $RDS_CURRENT_VPC."
  RDS_ENDPOINT=$(aws rds describe-db-instances \
    --db-instance-identifier "$RDS_ID" \
    --query "DBInstances[0].Endpoint.Address" --output text \
    --region "$AWS_REGION" 2>/dev/null) || RDS_ENDPOINT="<ver aviso arriba>"
fi

echo "  RDS: $RDS_ENDPOINT"

# =============================================================================
# 8. ECS Cluster
# =============================================================================
echo "→ [8/11] ECS cluster..."
aws ecs create-cluster --cluster-name "$CLUSTER" \
  --region "$AWS_REGION" &>/dev/null || true
echo "  OK — $CLUSTER"

# =============================================================================
# 9. CloudWatch Log Groups
# =============================================================================
echo "→ [9/11] CloudWatch log groups..."
aws logs create-log-group --log-group-name /ecs/taskflow-backend --region "$AWS_REGION" 2>/dev/null || true
aws logs create-log-group --log-group-name /ecs/taskflow-web     --region "$AWS_REGION" 2>/dev/null || true

# =============================================================================
# 10. ALB — solo subredes públicas
# =============================================================================
echo "→ [10/11] ALB..."
ALB_ARN=$(aws elbv2 describe-load-balancers \
  --names taskflow-alb --region "$AWS_REGION" \
  --query "LoadBalancers[0].LoadBalancerArn" --output text 2>/dev/null) \
|| ALB_ARN=$(aws elbv2 create-load-balancer \
    --name taskflow-alb \
    --subnets "$PUB_A" "$PUB_B" \
    --security-groups "$ALB_SG" \
    --region "$AWS_REGION" \
    --query "LoadBalancers[0].LoadBalancerArn" --output text)

ALB_DNS=$(aws elbv2 describe-load-balancers \
  --load-balancer-arns "$ALB_ARN" --region "$AWS_REGION" \
  --query "LoadBalancers[0].DNSName" --output text)

BACKEND_TG_ARN=$(aws elbv2 describe-target-groups \
  --names taskflow-backend-tg --region "$AWS_REGION" \
  --query "TargetGroups[0].TargetGroupArn" --output text 2>/dev/null) \
|| BACKEND_TG_ARN=$(aws elbv2 create-target-group \
    --name taskflow-backend-tg --protocol HTTP --port 3000 \
    --vpc-id "$VPC_ID" --target-type ip \
    --health-check-path /api/health --health-check-interval-seconds 30 \
    --region "$AWS_REGION" \
    --query "TargetGroups[0].TargetGroupArn" --output text)

WEB_TG_ARN=$(aws elbv2 describe-target-groups \
  --names taskflow-web-tg --region "$AWS_REGION" \
  --query "TargetGroups[0].TargetGroupArn" --output text 2>/dev/null) \
|| WEB_TG_ARN=$(aws elbv2 create-target-group \
    --name taskflow-web-tg --protocol HTTP --port 80 \
    --vpc-id "$VPC_ID" --target-type ip \
    --health-check-path / --health-check-interval-seconds 30 \
    --region "$AWS_REGION" \
    --query "TargetGroups[0].TargetGroupArn" --output text)

LISTENER_ARN=$(aws elbv2 describe-listeners \
  --load-balancer-arn "$ALB_ARN" --region "$AWS_REGION" \
  --query "Listeners[0].ListenerArn" --output text 2>/dev/null) \
|| LISTENER_ARN=$(aws elbv2 create-listener \
    --load-balancer-arn "$ALB_ARN" \
    --protocol HTTP --port 80 \
    --default-actions "Type=forward,TargetGroupArn=$WEB_TG_ARN" \
    --region "$AWS_REGION" \
    --query "Listeners[0].ListenerArn" --output text)

aws elbv2 create-rule \
  --listener-arn "$LISTENER_ARN" \
  --conditions '[{"Field":"path-pattern","Values":["/api/*"]}]' \
  --priority 10 \
  --actions "Type=forward,TargetGroupArn=$BACKEND_TG_ARN" \
  --region "$AWS_REGION" 2>/dev/null || true

echo "  ALB DNS: $ALB_DNS"

# =============================================================================
# 11. ECS task definitions (placeholder) + services
# =============================================================================
echo "→ [11/11] ECS services..."

PUB_SUBNETS_JSON="[\"$PUB_A\",\"$PUB_B\"]"

_register_placeholder_td() {
  local family="$1" container="$2" port="$3" cpu="$4" mem="$5"
  aws ecs describe-task-definition --task-definition "$family" \
    --region "$AWS_REGION" &>/dev/null && return
  aws ecs register-task-definition \
    --family "$family" \
    --network-mode awsvpc \
    --requires-compatibilities FARGATE \
    --cpu "$cpu" --memory "$mem" \
    --execution-role-arn "$EXEC_ROLE_ARN" \
    --container-definitions "[{
      \"name\":\"$container\",
      \"image\":\"public.ecr.aws/nginx/nginx:stable-alpine\",
      \"portMappings\":[{\"containerPort\":$port,\"protocol\":\"tcp\"}],
      \"logConfiguration\":{\"logDriver\":\"awslogs\",\"options\":{
        \"awslogs-group\":\"/ecs/$family\",
        \"awslogs-region\":\"$AWS_REGION\",
        \"awslogs-stream-prefix\":\"ecs\"
      }},
      \"essential\":true
    }]" \
    --region "$AWS_REGION" > /dev/null
}

_register_placeholder_td taskflow-backend backend 3000 512 1024
_register_placeholder_td taskflow-web     web     80   256  512

_create_service_if_missing() {
  local name="$1" td="$2" sg="$3" tg="$4" container="$5" port="$6"
  aws ecs describe-services --cluster "$CLUSTER" --services "$name" \
    --region "$AWS_REGION" \
    --query "services[?status=='ACTIVE'].serviceName" \
    --output text 2>/dev/null | grep -q "$name" \
  && { echo "  ya existe: $name"; return; }
  aws ecs create-service \
    --cluster "$CLUSTER" --service-name "$name" \
    --task-definition "$td" --desired-count 1 \
    --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=$PUB_SUBNETS_JSON,securityGroups=[\"$sg\"],assignPublicIp=ENABLED}" \
    --load-balancers "targetGroupArn=$tg,containerName=$container,containerPort=$port" \
    --health-check-grace-period-seconds 60 \
    --region "$AWS_REGION" > /dev/null
  echo "  creado: $name"
}

_create_service_if_missing taskflow-backend taskflow-backend "$BACKEND_SG" "$BACKEND_TG_ARN" backend 3000
_create_service_if_missing taskflow-web     taskflow-web     "$WEB_SG"     "$WEB_TG_ARN"     web     80

# =============================================================================
# Resumen final
# =============================================================================
cat <<SUMMARY

════════════════════════════════════════════════════════════════════
  ✅  Infraestructura lista.
════════════════════════════════════════════════════════════════════

  VPC       : $VPC_ID (10.0.0.0/16)
  Públicas  : $PUB_A ($AZ_A), $PUB_B ($AZ_B)  — ALB + ECS
  Privadas  : $PRIV_A ($AZ_A), $PRIV_B ($AZ_B) — RDS (sin ruta a IGW)
  RDS       : $RDS_ENDPOINT  ← accesible solo desde taskflow-backend-sg
  Secret    : $SECRET_ARN
  ALB       : http://$ALB_DNS

  ── GitHub Secrets (repo → Settings → Secrets → Actions) ─────────

  AWS_REGION              = $AWS_REGION
  AWS_ACCOUNT_ID          = $ACCOUNT_ID
  AWS_ACCESS_KEY_ID       = <clave IAM del usuario de deploy>
  AWS_SECRET_ACCESS_KEY   = <secreto IAM del usuario de deploy>
  DATABASE_URL            = postgresql://${RDS_USERNAME:-postgres}:<password>@$RDS_ENDPOINT:5432/${RDS_DB_NAME:-postgres}?schema=public
  JWT_ACCESS_SECRET       = <openssl rand -base64 48>
  JWT_REFRESH_SECRET      = <openssl rand -base64 48>
  COOKIE_SECRET           = <openssl rand -base64 48>
  S3_BUCKET_NAME          = $S3_BUCKET_NAME
  CORS_ORIGIN             = http://$ALB_DNS
  APP_PUBLIC_URL          = http://$ALB_DNS

  El CI/CD carga DATABASE_URL, JWT_*, COOKIE_SECRET y las claves S3 en
  Secrets Manager (taskflow/prod) en cada push. El resto se inyecta
  como env vars no sensibles en la task definition.

  Haz push a main para arrancar el primer despliegue.
════════════════════════════════════════════════════════════════════
SUMMARY
