import { useEffect, useState } from "react";

const STORAGE_KEY = "gam-linked-community-posts";
const CHANGE_EVENT = "gam-community-links-changed";

export function readCommunityLinks(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function connectCommunityPost(postId: string) {
  const next = [...new Set([...readCommunityLinks(), postId])];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useCommunityLinks(): string[] {
  const [linkedIds, setLinkedIds] = useState(readCommunityLinks);

  useEffect(() => {
    const sync = () => setLinkedIds(readCommunityLinks());
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return linkedIds;
}
