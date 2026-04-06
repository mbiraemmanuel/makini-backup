/**
 * MakiniBackupScheduler
 *
 * Schedulable Apex class that triggers the Makini Backup Cloud Run job
 * via an outbound HTTP callout.
 *
 * PREREQUISITE: Before scheduling, create a Named Credential in your org:
 *   Setup → Named Credentials → New Legacy
 *     Label:      Makini Backup Cloud Run
 *     Name:       Makini_Backup_Cloud_Run
 *     URL:        https://<YOUR_CLOUD_RUN_JOB_TRIGGER_URL>
 *     Identity:   Named Principal
 *     Auth Prot:  No Authentication  (Cloud Run is secured by IAM; token
 *                 is injected server-side via the dashboard, not from SF)
 *
 * SCHEDULE EXAMPLES (run from Developer Console → Execute Anonymous):
 *
 *   // Daily at 2 AM UTC
 *   System.schedule('Makini Daily Backup', '0 0 2 * * ?', new MakiniBackupScheduler());
 *
 *   // Every Sunday at midnight UTC
 *   System.schedule('Makini Weekly Backup', '0 0 0 ? * SUN', new MakiniBackupScheduler());
 *
 * To stop: Setup → Scheduled Jobs → Delete the job.
 */
global class MakiniBackupScheduler implements Schedulable {

    /** Developer name of the Backup_Configuration__mdt record to use */
    private String configName;

    global MakiniBackupScheduler() {
        this.configName = 'Default';
    }

    global MakiniBackupScheduler(String configDeveloperName) {
        this.configName = configDeveloperName;
    }

    global void execute(SchedulableContext ctx) {
        // Read configuration from Custom Metadata
        List<Backup_Configuration__mdt> configs = [
            SELECT
                DeveloperName,
                GCP_Project_ID__c,
                GCP_Region__c,
                Cloud_Run_Job_Name__c,
                Backup_Mode__c,
                SF_Username__c,
                Notification_Email__c
            FROM Backup_Configuration__mdt
            WHERE DeveloperName = :configName
            LIMIT 1
        ];

        if (configs.isEmpty()) {
            System.debug(LoggingLevel.ERROR,
                'MakiniBackupScheduler: No Backup_Configuration__mdt record found for: ' + configName);
            return;
        }

        Backup_Configuration__mdt cfg = configs[0];

        // Trigger the Cloud Run job asynchronously (Apex callouts must be async from Schedulable)
        MakiniBackupCallout.triggerBackup(
            cfg.GCP_Project_ID__c,
            cfg.GCP_Region__c,
            cfg.Cloud_Run_Job_Name__c,
            cfg.Backup_Mode__c
        );
    }
}
