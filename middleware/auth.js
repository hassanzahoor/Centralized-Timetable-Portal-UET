const isAuthenticated = (req, res, next) => {
  if (req.session && req.session.user) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized. Please login to continue.' });
};

const isAdmin = (req, res, next) => {
  if (req.session && req.session.user && req.session.user.role === 'admin') {
    return next();
  }
  return res.status(403).json({ error: 'Forbidden. Super Admin access required.' });
};

// Helper: Timetable slots can ONLY be modified by the specific department coordinator (dept_admin)! Super Admin cannot alter timetable slots.
const canManageDepartment = (user, deptId) => {
  if (!user) return false;
  if (user.role === 'dept_admin') {
    return Number(user.department_id) === Number(deptId);
  }
  return false;
};

const requireDepartmentAccess = (deptParamName = 'department_id') => {
  return (req, res, next) => {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ error: 'Unauthorized. Please login.' });
    }

    const targetDeptId = req.body[deptParamName] || req.query[deptParamName] || req.params[deptParamName];
    
    if (canManageDepartment(req.session.user, targetDeptId)) {
      return next();
    }

    return res.status(403).json({ error: 'Forbidden. You can only edit your assigned department schedule.' });
  };
};

module.exports = {
  isAuthenticated,
  isAdmin,
  canManageDepartment,
  requireDepartmentAccess
};
