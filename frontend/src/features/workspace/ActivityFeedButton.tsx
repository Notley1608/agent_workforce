import { useState } from "react";
import { Button } from "../../components/Button";
import { Dialog } from "../../components/Dialog";
import { ActivityFeed } from "./ActivityFeed";

export function ActivityFeedButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        📜 Activity
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title="Activity" className="w-[min(560px,95vw)]">
        <ActivityFeed />
      </Dialog>
    </>
  );
}
