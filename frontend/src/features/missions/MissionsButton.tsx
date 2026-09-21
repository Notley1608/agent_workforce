import { useState } from "react";
import { Button } from "../../components/Button";
import { Dialog } from "../../components/Dialog";
import { MissionsBoard } from "./MissionsBoard";

export function MissionsButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        🎯 Missions
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title="Missions" className="w-[min(900px,95vw)]">
        <MissionsBoard />
      </Dialog>
    </>
  );
}
