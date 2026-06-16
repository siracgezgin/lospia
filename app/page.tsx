import { redirect } from "next/navigation";

// Root "/" redirects to the board (middleware handles auth-gating)
export default function Home() {
  redirect("/board");
}
