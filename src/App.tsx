import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/shell/AppShell";
import { HomePage } from "@/features/home/HomePage";
import { AnnualMapPage } from "@/features/annual-map/AnnualMapPage";
import { DocumentsPage } from "@/features/documents/DocumentsPage";
import { NotesPage } from "@/features/notes/NotesPage";
import { HandoverPage } from "@/features/handover/HandoverPage";
import { TaskDetailPage } from "@/features/task-detail/TaskDetailPage";

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/home" replace />} />
        <Route path="home" element={<HomePage />} />
        <Route path="map" element={<AnnualMapPage />} />
        <Route path="docs" element={<DocumentsPage />} />
        <Route path="notes" element={<NotesPage />} />
        <Route path="handover" element={<HandoverPage />} />
        <Route path="tasks/:taskId" element={<TaskDetailPage />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Route>
    </Routes>
  );
}
