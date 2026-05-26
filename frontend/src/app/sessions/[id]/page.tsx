"use client";

import { redirect } from "next/navigation";

export default function SessionDetailPage() {
  redirect("/tasks/new");
}
