import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { fetchCurrentUserServer } from "@/lib/server-auth";

export default async function LoginPage() {
  const user = await fetchCurrentUserServer();

  if (user) {
    redirect("/app");
  }

  return <LoginForm />;
}
