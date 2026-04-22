import { createPermission } from '@backstage/plugin-permission-common';

export const c4DiagramReadPermission = createPermission({
  name: 'c4.diagram.read',
  attributes: { action: 'read' },
});

export const c4SyncTriggerPermission = createPermission({
  name: 'c4.sync.trigger',
  attributes: { action: 'create' },
});

export const c4Permissions = [c4DiagramReadPermission, c4SyncTriggerPermission];
