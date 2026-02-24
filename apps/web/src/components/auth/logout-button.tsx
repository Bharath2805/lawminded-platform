"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiUrl } from "@/lib/client-api";

type LogoutButtonProps = {
  className?: string;
};

export function LogoutButton({ className }: LogoutButtonProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const onLogout = async () => {
    setSubmitting(true);

    try {
      await fetch(`${apiUrl}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } finally {
      router.replace("/login");
      router.refresh();
      setSubmitting(false);
    }
  };

  return (
    <button
      type="button"
      className={className ?? "btn ghost small"}
      onClick={onLogout}
      disabled={submitting}
    >
      {submitting ? "Logging out..." : "Logout"}
    </button>
  );
}
