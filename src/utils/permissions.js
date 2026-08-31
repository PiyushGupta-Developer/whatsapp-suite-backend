const ROLES = ['Administrator', 'Manager', 'Operator', 'Viewer'];

const PERMISSIONS = {
  'dashboard.view': ['Administrator', 'Manager', 'Operator', 'Viewer'],
  'employees.view': ['Administrator', 'Manager'],
  'employees.create': ['Administrator'],
  'employees.edit': ['Administrator'],
  'employees.delete': ['Administrator'],
  'employees.activate': ['Administrator'],
  'devices.view': ['Administrator', 'Manager', 'Operator'],
  'devices.create': ['Administrator', 'Manager'],
  'devices.connect': ['Administrator', 'Manager', 'Operator'],
  'devices.delete': ['Administrator', 'Manager'],
  'campaigns.view': ['Administrator', 'Manager', 'Operator', 'Viewer'],
  'campaigns.create': ['Administrator', 'Manager', 'Operator'],
  'campaigns.edit': ['Administrator', 'Manager', 'Operator'],
  'campaigns.delete': ['Administrator', 'Manager'],
  'campaigns.schedule': ['Administrator', 'Manager', 'Operator'],
  'contacts.view': ['Administrator', 'Manager', 'Operator'],
  'contacts.create': ['Administrator', 'Manager', 'Operator'],
  'contacts.delete': ['Administrator', 'Manager'],
  'contacts.bulk': ['Administrator', 'Manager'],
  'media.view': ['Administrator', 'Manager', 'Operator'],
  'media.upload': ['Administrator', 'Manager', 'Operator'],
  'media.delete': ['Administrator', 'Manager'],
  'reports.view': ['Administrator', 'Manager', 'Viewer'],
  'settings.view': ['Administrator'],
  'settings.edit': ['Administrator'],
  'profile.view': ['Administrator', 'Manager', 'Operator', 'Viewer'],
  'profile.edit': ['Administrator', 'Manager', 'Operator', 'Viewer'],
};

function roleHasPermission(role, permission) {
  const allowed = PERMISSIONS[permission];
  if (!allowed) return false;
  return allowed.includes(role);
}

function permissionsForRole(role) {
  const result = {};
  for (const [key, roles] of Object.entries(PERMISSIONS)) {
    result[key] = roles.includes(role);
  }
  return result;
}

function allPermissionsList() {
  return Object.keys(PERMISSIONS).map((key) => ({
    key,
    roles: PERMISSIONS[key],
    module: key.split('.')[0],
    action: key.split('.')[1],
  }));
}

module.exports = { ROLES, PERMISSIONS, roleHasPermission, permissionsForRole, allPermissionsList };