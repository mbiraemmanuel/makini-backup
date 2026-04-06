/**
 * MakiniBackupInstallHandler
 *
 * Runs automatically when the Makini SF Backup package is installed or upgraded.
 * Logs the installation and writes a reminder in the org about the manual
 * post-install steps still required.
 *
 * To test: System.runAs(new User(Id = UserInfo.getUserId())) {
 *              new MakiniBackupInstallHandler().onInstall(null);
 *          }
 */
global class MakiniBackupInstallHandler implements InstallHandler {

    global void onInstall(InstallContext ctx) {
        try {
            String version = ctx != null
                ? 'v' + ctx.previousVersion()?.major() + '.' + ctx.previousVersion()?.minor()
                : 'initial';

            Boolean isUpgrade = ctx != null && ctx.isUpgrade();
            Boolean isPush    = ctx != null && ctx.isPush();

            String actionLabel = isUpgrade ? 'upgraded' : (isPush ? 'pushed' : 'installed');

            String body =
                'Makini SF Backup package ' + actionLabel + ' successfully.\n\n' +
                '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
                'REQUIRED POST-INSTALL STEPS\n' +
                '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
                '1. UPLOAD CERTIFICATE\n' +
                '   Setup → App Manager → "Makini SF Backup" → Edit\n' +
                '   → Enable JWT Bearer Flow → Upload your certificate.pem\n' +
                '   (Generate the certificate using the Makini Setup Wizard)\n\n' +
                '2. CREATE INTEGRATION USER\n' +
                '   Create a dedicated user (e.g. backup.user@yourorg.com)\n' +
                '   with a System Administrator or custom profile with API access.\n\n' +
                '3. ASSIGN PERMISSION SET\n' +
                '   Assign "Makini Backup Integration" permission set to the integration user.\n\n' +
                '4. APPROVE OAUTH ACCESS\n' +
                '   Setup → Connected Apps OAuth Usage → Makini SF Backup → Install/Uninstall\n' +
                '   Verify the integration user is listed. If not, they must log in once\n' +
                '   OR you can pre-approve via "Manage Connected Apps" → Edit → Admin-approved users.\n\n' +
                '5. NOTE THE CONSUMER KEY\n' +
                '   Setup → App Manager → Makini SF Backup → View → Consumer Key\n' +
                '   Copy this into the Makini Setup Wizard (Step 2).\n\n' +
                '6. COMPLETE SETUP WIZARD\n' +
                '   Open the Makini Backup Dashboard and run the Setup Wizard at /setup.\n\n' +
                '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
                'Support: support@makiniconsulting.com\n';

            // Email the installing admin
            String adminEmail = ctx != null
                ? [SELECT Email FROM User WHERE Id = :ctx.installerId() LIMIT 1].Email
                : UserInfo.getUserEmail();

            Messaging.SingleEmailMessage mail = new Messaging.SingleEmailMessage();
            mail.setToAddresses(new String[]{ adminEmail });
            mail.setSubject('Makini SF Backup — Package installed. Action required.');
            mail.setPlainTextBody(body);
            mail.setSenderDisplayName('Makini SF Backup');
            Messaging.sendEmail(new Messaging.SingleEmailMessage[]{ mail });

        } catch (Exception e) {
            // Never fail an install due to notification errors
            System.debug(LoggingLevel.WARN, 'MakiniBackupInstallHandler: ' + e.getMessage());
        }
    }
}
