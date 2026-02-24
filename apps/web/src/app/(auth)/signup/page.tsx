import { redirect } from "next/navigation";
import { SignupForm } from "@/components/auth/signup-form";
import { fetchCurrentUserServer } from "@/lib/server-auth";

export default async function SignupPage() {
  const user = await fetchCurrentUserServer();

  if (user) {
    redirect("/app");
  }

  return <SignupForm />;
}
