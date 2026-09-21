import { useState } from "react";
import { Button } from "../../components/Button";
import { Dialog } from "../../components/Dialog";
import { PipelinesBoard } from "./PipelinesBoard";

export function PipelinesButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        🔗 Pipelines
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title="Pipelines" className="w-[min(900px,95vw)]">
        <PipelinesBoard />
      </Dialog>
    </>
  );
}
