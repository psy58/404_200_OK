import {
  RawUploadRecordSchema,
  RawUploadsResponseSchema,
  type RawUploadRecord,
} from "@/domain/raw-schemas";
import { fetchMock, postFile } from "./mockClient";

/**
 * F04 업로드 — 저장 후 배경에서 markitdown 변환 → LangChain 분할 →
 * (키 있으면) 색인까지 진행된다. 상태는 getUploads 로 따라간다.
 */
export async function uploadDocument(file: File): Promise<RawUploadRecord> {
  return postFile("/api/frontend/uploads", file, RawUploadRecordSchema);
}

/** 처리 상태 확인용 — 업로드 후 변환·색인이 배경에서 진행된다. */
export async function getUploads(): Promise<RawUploadRecord[]> {
  const raw = await fetchMock("/api/frontend/uploads", RawUploadsResponseSchema);
  return raw.items;
}
