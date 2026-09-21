import { useState } from "react";
import { Button } from "../../components/Button";
import { Dialog } from "../../components/Dialog";
import { OpportunityBoard } from "./OpportunityBoard";

export function MissionControlButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        📋 Mission Control
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title="Mission Control" className="w-[min(1100px,95vw)]">
        <OpportunityBoard />
      </Dialog>
    </>
  );
}
