import { z } from "zod";

export const authUserSchema = z.object({
  email: z.email(),
  password: z.string().check(z.minLength(8)),
});

export const signupSchema = z.object({
  name: z.string().check(z.minLength(4)),
  email: z.email(),
  password: z.string().check(z.regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{12,}$/)),
  phoneNumber: z.string().optional(),
  usertype: z.string().optional(),
  schoolId: z.number().optional(),
  role: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().check(z.minLength(8)),
});

export const googleOAuthCallbackSchema = z.object({
  // Cookies
  google_oauth_state: z.string().min(1, "OAuth state cannot be empty"),
  google_code_verifier: z.string().min(1, "Code verifier cannot be empty"),

  // URLSearchParams
  state: z.string().min(1, "State parameter cannot be empty"),
  code: z.string().min(1, "Authorization code cannot be empty"),
});
