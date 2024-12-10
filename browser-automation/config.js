// Config used by the browser automation
// NOTE: To apply environment specific config
//      - create a copy of this JS file and name it as env.config.js
//      - place it in the same location as this config
//      - Set the values in the config as needed
//      - Runtime will merge environment configuarations with the base
module.exports = {
    debugMode: false,
    // Available values for login mode - "none", "manual", "keyvault"
    //  "none"      No authentication will be performed by the system. You can still perform interactive authentication 
    //              using a DSL script detecting and presenting your own login screen
    //  "manual"    ONLY supported for Microsoft Entra ID. Authentication will be triggered when the node process is launched. 
    //              If previously authenticated, this will be a passthrough.
    //              Recommended for DEV scenarios as it needs no additional setup. May require re-auth from time to time.
    //  "keyvault"  ONLY supported for Microsoft Entra ID. Authentication will be handled using credentials fetched from the Azure Key Vault.
    //              Must provide the rpaCredentials values, including the username, password keyvault name, and the secret name
    //              In this mode, the credentials will be acquired on startup from KV and will be retained in memory
    //              Recommneded for PROD scenarios to allow unattended repeated logins
    //              NOTE: CBA support is not implemented yet, will be implemented soon
    loginMode: "none", 
    // RPA credentials are used in the "keyvault" login mode
    // Credential password must be stored in the AZ key vault
    rpaCredentials: {
        userName: "",           // User name or email (whichever is needed for login)
        password:{
            keyVault: "",       // Name of the keyvault that the executing Azure identity (e.g. the machine) has access to
            secret: ""          // Name of the secret in the keyvault
        },
        cba: {
            keyVault: "",       // ex: RPACerts
            cert: ""            // Name of the cert in the keyvault
        }
    },
    networkTracking: {
        // Ignore list pattern helps disregarding non-essential network traffic (e.g. telemetry events) while detecting idle state in browser automation
        ignore:[
            "https://*.services.visualstudio.com/v2/track*",
            "https://*.fluidrelay.azure.com/*",
            "https://*.aria.microsoft.com/*",
            "https://*.office.com/*",
            "https://*.events.data.microsoft.com/*",
            "https://certauth.login.microsoftonline.com/*"
        ]
    },
    openaiApiKey: "",           // Open AI API key to be able to make LLM calls
    openaiModels: {
        taskAssistant: "gpt-3.5-turbo"
    },
    browserPool: {
        maxCount: 8,
        timeoutSec: 30
    },
    monitor:{
        bufferIntervalMsec: 400,
        enableLiveView: true
    }
}
