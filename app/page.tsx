"use client";

import { useAuth } from "./components/AuthGate";
import ChatPage from "./chat/page";
import LandingPage from "./components/LandingPage";

export default function HomePage() {
  const { user } = useAuth();

  return user ? <ChatPage /> : <LandingPage />;
}
