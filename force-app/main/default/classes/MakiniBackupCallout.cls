/**
 * MakiniBackupCallout
 *
 * Makes the outbound HTTP callout to trigger a GCP Cloud Run Job execution.
 * Called from MakiniBackupScheduler — must be @future(callout=true) since
 * Schedulable.execute() cannot make synchronous callouts.
 *
 * The Cloud Run Jobs trigger endpoint:
 *   POST https://<region>-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/<project>/jobs/<job>:run
 *
 * Authentication is handled server-side (the dashboard injects the GCP token).
 * From Apex we call our own dashboard endpoint which proxies the trigger.
 * Set up the Named Credential "Makini_Backup_Dashboard" pointing to
 * your dashboard URL (e.g. https://yourcompany.vercel.app).
 */
public with sharing class MakiniBackupCallout {

    /**
     * Trigger a backup job for the given configuration.
     * Uses a @future callout so it can be invoked from Schedulable context.
     *
     * @param gcpProject     GCP project ID
     * @param gcpRegion      GCP region (e.g. us-central1)
     * @param jobName        Cloud Run Job name
     * @param backupMode     full | data | metadata | files
     */
    @future(callout=true)
    public static void triggerBackup(
        String gcpProject,
        String gcpRegion,
        String jobName,
        String backupMode
    ) {
        try {
            // ── Build request body ───────────────────────────────────────
            Map<String, Object> payload = new Map<String, Object>{
                'gcp_project'  => gcpProject,
                'gcp_region'   => gcpRegion,
                'job_name'     => jobName,
                'backup_mode'  => (String.isBlank(backupMode) ? 'full' : backupMode)
            };

            HttpRequest req = new HttpRequest();
            // Named Credential "Makini_Backup_Dashboard" must point to dashboard URL
            req.setEndpoint('callout:Makini_Backup_Dashboard/api/gcp/trigger-job');
            req.setMethod('POST');
            req.setHeader('Content-Type', 'application/json');
            req.setBody(JSON.serialize(payload));
            req.setTimeout(30000); // 30s — Cloud Run accepts and returns quickly

            Http http = new Http();
            HttpResponse res = http.send(req);

            if (res.getStatusCode() == 200 || res.getStatusCode() == 202) {
                System.debug(LoggingLevel.INFO,
                    'MakiniBackupCallout: Job triggered successfully. Response: ' + res.getBody());
            } else {
                System.debug(LoggingLevel.ERROR,
                    'MakiniBackupCallout: Unexpected response ' + res.getStatusCode() +
                    ' — ' + res.getBody());
            }

        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR,
                'MakiniBackupCallout: Exception — ' + e.getMessage() + '\n' + e.getStackTraceString());
        }
    }
}
