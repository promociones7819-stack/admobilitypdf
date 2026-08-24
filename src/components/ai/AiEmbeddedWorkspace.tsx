import { AiProvider } from "@/lib/ai/store";
import { AiWorkspace } from "@/routes/ia";

export default function AiEmbeddedWorkspace({ onBack }: { onBack: () => void }) {
  return (
    <AiProvider>
      <AiWorkspace embedded onBack={onBack} />
    </AiProvider>
  );
}
