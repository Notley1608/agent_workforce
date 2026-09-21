import { refreshActivity } from "./activity.js";
import { initAgents, refreshAgents } from "./agents.js";
import { initAutomationsPanel } from "./automationsPanel.js";
import { initMissions, refreshMissions } from "./missions.js";
import { initOpportunities, refreshLedger, refreshOpportunities } from "./opportunities.js";
import { initPipelines, refreshPipelines } from "./pipelines.js";
import { initWorkspace, refreshInfrastructure, refreshUsage } from "./workspace.js";

initAgents();
initPipelines();
initMissions();
initOpportunities();
initAutomationsPanel();
initWorkspace();

refreshAgents();
refreshInfrastructure();
refreshPipelines();
refreshMissions();
refreshOpportunities();
refreshLedger();
refreshUsage();
refreshActivity();

setInterval(refreshAgents, 4000);
setInterval(refreshUsage, 10000);
setInterval(refreshActivity, 5000);
setInterval(refreshMissions, 5000);
setInterval(refreshOpportunities, 5000);
setInterval(refreshLedger, 10000);
