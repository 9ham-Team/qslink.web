import './runtime';
import { createApplication } from './application';
import { exploreMemoryVue3 } from './explore-memory';
import { bootShellVue3 } from './shell-entry';

// Exported for module consumers and browser tests; never assigned to window.
export const application = createApplication();
application.on('auth', () => exploreMemoryVue3.clear());
void bootShellVue3(application);
