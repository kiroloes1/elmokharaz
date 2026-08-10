const ActivityLog = require(`${__dirname}/../models/activationLogs`);

exports.createLog = async ({
  section,
  action,
  userId,
  targetId = null,
  title = "",
  details = "",
  session = null,
}) => {
  try {
    await ActivityLog.create(
      [{
        section,
        action,
        user: userId,
        targetId,
        title,
        details,
      }],
      session ? { session } : {}
    );
  } catch (error) {
    console.error("خطأ أثناء تسجيل النشاط:", error.message);
  }
};
