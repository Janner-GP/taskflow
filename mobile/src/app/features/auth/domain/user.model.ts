/** Mirrors the `User` model in docs/CONTRACT.md. No password field ever leaves the API. */
export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  name: string;
  email: string;
  /** Server rule: min 8 chars, at least one uppercase and one digit. */
  password: string;
}
