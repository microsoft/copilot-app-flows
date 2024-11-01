'use strict';

var express = require('express');
var asyncHandler = require('express-async-handler');
var http = require('http');
var uuid = require('uuid');
var promises = require('node:timers/promises');
var puppeteer = require('puppeteer');
var fetch$1 = require('node-fetch');
var async_hooks = require('async_hooks');
var fs = require('fs');
var path = require('path');
var deepmerge = require('deepmerge');
var urlpatternPolyfill = require('urlpattern-polyfill');
var identity = require('@azure/identity');
var identityCachePersistence = require('@azure/identity-cache-persistence');
var keyvaultSecrets = require('@azure/keyvault-secrets');
var tinycolor = require('tinycolor2');
var socket_io = require('socket.io');
var node_crypto = require('node:crypto');
var ejs = require('ejs');
var marked = require('marked');
var JsInterpreter = require('js-interpreter');
var ts = require('typescript');
var core = require('@babel/core');
var OpenAI = require('openai');
var Fuse = require('fuse.js');
var serviceBus = require('@azure/service-bus');
var crypto = require('crypto');
var moment = require('moment');
var url = require('url');
var relay = require('hyco-https/lib/HybridConnectionHttpsServer');

function _interopNamespaceDefault(e) {
    var n = Object.create(null);
    if (e) {
        Object.keys(e).forEach(function (k) {
            if (k !== 'default') {
                var d = Object.getOwnPropertyDescriptor(e, k);
                Object.defineProperty(n, k, d.get ? d : {
                    enumerable: true,
                    get: function () { return e[k]; }
                });
            }
        });
    }
    n.default = e;
    return Object.freeze(n);
}

var ts__namespace = /*#__PURE__*/_interopNamespaceDefault(ts);
var relay__namespace = /*#__PURE__*/_interopNamespaceDefault(relay);

const defaultUserProfileName = "rpa-default-user";
const envConfigPath = "/env.config.js";
let config;
let envConfig;
function loadConfig() {
    // First load the base config
    config = requireConfig("/config.js");
    // Try to see if we can load any env config
    try {
        console.log(`Loading environment config`);
        envConfig = requireConfig(envConfigPath);
        //log(`Env config ${JSON.stringify(envConfig)}`);
        // Deep merge configs, override arrays if there
        config = mergeConfig(config, envConfig);
    }
    catch {
        console.warn(`Environment config not found`);
    }
}
// Require a config w.r.t the current directory
function requireConfig(configPath) {
    return require(path.join(process.cwd(), configPath));
}
// Default load initial config
loadConfig();
function mergeConfig(x, y) {
    return deepmerge(x, y, { arrayMerge: (target, source, _) => source });
}
/**
 * Saves partial changes to the config in the env.config.js file
 * @param config
 */
async function updateConfig(delta) {
    if (envConfig) {
        // Update the existing env config
        envConfig = mergeConfig(envConfig, delta);
    }
    else {
        envConfig = delta;
    }
    // Apply changes to the main config
    config = mergeConfig(config, envConfig);
    // Save the updated env config
    await fs.promises.writeFile(path.join(process.cwd(), envConfigPath), `module.exports = ${JSON.stringify(envConfig, null, 4)}`);
}

// Used for captureing logging context via async execution chain
const asyncLocalStorage = new async_hooks.AsyncLocalStorage();
// Runs an action with the given trace context
function withTraceContext(contextParams, action) {
    if (contextParams?.remoteCallbackUrl) {
        contextParams.remoteCallbackUrl = decodeURIComponent(contextParams.remoteCallbackUrl);
    }
    asyncLocalStorage.run(new TraceContext(contextParams), action);
}
function log(message, type) {
    getTraceContext().trace(message, type ?? TraceType.Info);
}
function warn(message) {
    getTraceContext().trace(message, TraceType.Warning);
}
function error(message) {
    getTraceContext().trace(message, TraceType.Error);
}
function getTraceParams() {
    return getTraceContext().params;
}
const logStreamHandlers = [];
function registerLogStreamHandler(handler) {
    logStreamHandlers.push(handler);
}
function getTraceContext() {
    return asyncLocalStorage.getStore() ?? defaultContext;
}
// Handles tracing related operation
class TraceContext {
    constructor(params) {
        this.params = params;
        this.monitorQueue = [];
    }
    trace(message, type) {
        const timestamp = new Date();
        switch (type) {
            case TraceType.Error:
                console.error(`\x1b[41m[${timestamp.toLocaleString()}] ${message}\x1b[0m`);
                break;
            case TraceType.Warning:
                console.warn(`\x1b[33m[${timestamp.toLocaleString()}] ${message}\x1b[0m`);
                break;
            default:
                console.log(`[${timestamp.toLocaleString()}] ${message}`);
                break;
        }
        this.monitorQueue.push({ message, timestamp, type });
        this.flushTraceQueue();
    }
    async flushTraceQueue() {
        if (!this.flushing &&
            (logStreamHandlers.length > 0 || this.params?.remoteCallbackUrl)) {
            this.flushing = true;
            // One async queue to flush pending items
            globalThis.setTimeout(async () => {
                try {
                    while (this.monitorQueue.length > 0) {
                        const items = this.monitorQueue
                            .splice(0, this.monitorQueue.length)
                            // Exclude verbose logs
                            .filter(i => i.type !== TraceType.Verbose);
                        if (items.length > 0) {
                            if (logStreamHandlers.length > 0) {
                                for (const handler of logStreamHandlers) {
                                    await handler.sendLogs(this.params, items);
                                }
                            }
                            if (this.params.remoteCallbackUrl) {
                                await fetch$1(this.params.remoteCallbackUrl + '/publish', {
                                    method: 'post',
                                    body: JSON.stringify({
                                        AccessToken: this.params.remoteToken,
                                        Logs: items
                                    }),
                                    headers: { 'Content-Type': 'application/json' },
                                });
                            }
                        }
                        // Wait some time (to buffer) before continuing
                        await promises.setTimeout(config.monitor.bufferIntervalMsec ?? 400);
                    }
                    ;
                }
                catch (err) {
                    error(`Monitor publish failed: ${err.message}`);
                }
                this.flushing = false;
            });
        }
    }
}
const defaultContext = new TraceContext({});
var TraceType;
(function (TraceType) {
    TraceType[TraceType["Verbose"] = 0] = "Verbose";
    TraceType[TraceType["Info"] = 1] = "Info";
    TraceType[TraceType["Warning"] = 2] = "Warning";
    TraceType[TraceType["Error"] = 3] = "Error";
})(TraceType || (TraceType = {}));
const MonitorTokenHeaderName = "x-monitortoken";
const MonitorCallbackUrlHeaderName = "x-monitorcallbackurl";
const MonitorSessionHeaderName = "x-monitorsession";

// Each page watcher is meant to be used as a single instance for each page
class PageWatcher {
    //private _inflightRequestCount = 0;
    constructor(page) {
        this.page = page;
        this._inflightRequests = new Map();
    }
    async initialize() {
        const page = this.page;
        // Setup various watchers using page events
        page.on("framenavigated", f => {
            if (f == page.mainFrame()) {
                this._lastNavigated = Date.now();
                //log(`Page main frame navigated event - url: ${stripUrlQuery(f.url())}`);
            }
        });
        page.on("load", () => {
            this._lastLoad = Date.now();
            //log(`Page loaded event - url: ${stripUrlQuery(page.url())}`)
        });
        page.on("request", this.onRequestStarted.bind(this));
        page.on("requestfinished", this.onRequestEnded.bind(this));
        page.on("requestfailed", this.onRequestEnded.bind(this));
        page.on("requestservedfromcache", this.onRequestEnded.bind(this));
        // page.on("close", () => log(`Page closed event`));
        // page.on("error", () => log(`Page error event`));
        // page.on("domcontentloaded", () => log(`Page domcontentloaded event`));
        // Track DOM content changes in the page
        await page.exposeFunction('puppeteerDOMContentChanged', () => {
            this._lastContentChanged = Date.now();
        });
        // Content change event is debounced to 100ms min interval
        await page.evaluateOnNewDocument(() => {
            (function () {
                let timer;
                const observer = new MutationObserver(() => {
                    if (!timer) {
                        timer = window.setTimeout(() => {
                            timer = undefined;
                            // @ts-ignore
                            puppeteerDOMContentChanged?.();
                        }, 100);
                    }
                });
                // Poll until the document loads
                const interval = window.setInterval(() => {
                    if (document.documentElement) {
                        // Observe everything
                        observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
                        window.clearInterval(interval);
                    }
                });
            })();
        });
    }
    onRequestStarted(request) {
        const url = request.url();
        // Make sure the URL is not in the ignore list
        if (!PageWatcher.networkIgnorePatterns?.find(p => p.exec(url))) {
            if (request.isNavigationRequest() && request.frame() === this.page.mainFrame()) {
                // Clear out all inflight requests as we are navigating to a new page
                this._inflightRequests.clear();
                //log(`Page navigation request starting ${stripUrlQuery(url)}`)
            }
            this._inflightRequests.set(request, Date.now());
            //this._inflightRequestCount++;
            this._lastNetworkRequestStart = Date.now();
            // if(url.indexOf("/api/data/v9.0/") !== -1){
            //     log(`Dataverse call starting`)
            // }
        }
        // else{
        //     log(`Ignoring URL ${url}`);
        // }
    }
    onRequestEnded(request) {
        if (this._inflightRequests.has(request)) {
            this._inflightRequests.get(request);
            this._inflightRequests.delete(request);
            //this._inflightRequestCount--;
            this._lastNetworkRequestEnd = Date.now();
            // if(request.url().indexOf("/api/data/v9.0/") !== -1){
            //     if(request.url().indexOf("GetClientMetadata") !== -1){
            //         log(`${request.method()} GCM call took ${Date.now()-startTime} ms`)
            //     }
            //     else{
            //         log(`${request.method()} Data call took ${Date.now()-startTime} ms`)
            //     }
            // }
            // else{
            //     log(`${request.method()} Other call took ${Date.now()-startTime} ms, request origin: ${new URL(request.url()).origin}`)
            // }
        }
    }
    get lastNavigated() { return this._lastNavigated; }
    get lastNetworkRequestStart() { return this._lastNetworkRequestStart; }
    get lastNetworkRequestEnd() { return this._lastNetworkRequestEnd; }
    get inflightNetwokRequestCount() { return this._inflightRequests.size; }
    get inflightNetworkRequests() { return Array.from(this._inflightRequests.keys()); }
    get lastLoad() { return this._lastLoad; }
    get lastContentChanged() { return this._lastContentChanged; }
    static async start(page) {
        const watcher = new PageWatcher(page);
        await watcher.initialize();
        this.pageWatchers.set(page, watcher);
        return watcher;
    }
    static get(page) {
        return this.pageWatchers.get(page);
    }
}
PageWatcher.networkIgnorePatterns = config.networkTracking?.ignore?.map(p => new urlpatternPolyfill.URLPattern(p));
PageWatcher.pageWatchers = new WeakMap();
function stripUrlQuery(url) {
    if (url) {
        const queryIndex = url.indexOf('?');
        if (queryIndex >= 0) {
            return url.substring(0, queryIndex);
        }
    }
    return url;
}
// Checks if the network has been idle for the given time
function isNetworkIdle(watcher, idletime) {
    if (watcher.inflightNetwokRequestCount < 1 &&
        watcher.lastNetworkRequestEnd < (Date.now() - idletime)) {
        return true;
    }
    return false;
}
function logPendingNetworkRequests(watcher) {
    if (watcher.inflightNetwokRequestCount > 0) {
        log(`Inflight count: ${watcher.inflightNetwokRequestCount}`);
        log(`Inflight requests: ${watcher.inflightNetworkRequests.map(req => stripUrlQuery(req.url())).join(", ")}`);
    }
}
async function waitForNetworkIdle(page, idletime) {
    idletime = idletime ?? 1000;
    const start = Date.now();
    const watcher = PageWatcher.get(page);
    await pollUntil(() => {
        //log(`Watching last network request ${watcher.lastNetworkRequest}`)
        if (isNetworkIdle(watcher, idletime)) {
            log(`Network went idle`);
            return true;
        }
        if ((Date.now() - start) > 10000) {
            // We have been waiting for 10s, start logging for stall
            log(`Waiting for network to go idle`);
            logPendingNetworkRequests(watcher);
        }
        return false;
    }, 400, 30000);
}
// Heuristically determines if the page has been loaded or is in the middle of transitioning and loading
// Condition is as follows -
// A certain amount of idletime must have passed since the last frame navigation event on this page
// NOTE: the page may continue to have ongoing network activity and async updates 
// One should cascade additional conditions to determine when the page is functionally loaded
async function waitForPageNavigationEnd(page) {
    const idletime = 500;
    const start = Date.now();
    const watcher = PageWatcher.get(page);
    await pollUntil(() => {
        // Both the last navigation and ongoing network requests mast pass the idle-time to gurrantee we are not in the middle of another transition
        if ((watcher.lastNavigated + idletime) <= Date.now() &&
            isNetworkIdle(watcher, idletime)) {
            // We are past the required idle time, so no need to poll any longer
            log(`--- Page navigation end detected ---`);
            return true;
        }
        if ((Date.now() - start) > 10000) {
            // We have been waiting for 10s, start logging for stall
            log(`Waiting for page navigation to settle, last navigation: ${Date.now() - watcher.lastNavigated} ms ago`);
            logPendingNetworkRequests(watcher);
        }
        return false;
    }, idletime / 2, 30000);
}
// Waits until the page navigates to the given URL based condition
// This is detected at the begining of the navigation, not at the end
async function waitForPageNavigation(page, condition) {
    return new Promise(resolve => {
        if (condition(page.url())) {
            resolve();
        }
        else {
            // Subscribe to the page request event
            const requestHandler = async (request) => {
                // Check if it is a page navigation request and the condition is met
                if (request.isNavigationRequest() &&
                    request.frame() === page.mainFrame() &&
                    condition(request.url())) {
                    page.off('request', requestHandler);
                    resolve();
                }
            };
            page.on('request', requestHandler);
        }
    });
}
async function pollUntil(condition, interval, timeout) {
    return pollUntilAsync(() => Promise.resolve(condition()), interval, timeout);
}
async function pollUntilAsync(condition, interval, timeout) {
    interval = interval ?? 500;
    timeout = timeout ?? 30000;
    const start = Date.now();
    while (!await condition()) {
        const waitTime = Date.now() - start;
        if (waitTime > timeout) {
            // We have timed out, throw
            warn(`Polling timed out after ${waitTime}ms`);
            throw new puppeteer.TimeoutError();
        }
        // Wait for the given interval
        await waitFor(interval);
    }
}
// Waits a given number of MS as an awaitable promise
function waitFor(delayMS) {
    return promises.setTimeout(delayMS);
}

require('fs');
identity.useIdentityPlugin(identityCachePersistence.cachePersistencePlugin);
// [Deprecated] no longer used as we are now using CBA
// Cached in-memory credentials
let rpaCredentials;
async function getRPACredentials() {
    if (!rpaCredentials) {
        rpaCredentials = await acquireRPACredentials();
    }
    return rpaCredentials;
}
async function acquireRPACredentials() {
    log("Acquiring RPA credentials");
    // First try to use managed identity credential (system assigned)
    // If not found, use interactive browser credential (for developer flow)
    const azCredential = new identity.ChainedTokenCredential(new identity.ManagedIdentityCredential(), new identity.InteractiveBrowserCredential({
        additionallyAllowedTenants: ["*"],
        tokenCachePersistenceOptions: { enabled: true }
    }));
    let password;
    if (config.rpaCredentials?.password) {
        // Fetch the password
        const url = `https://${config.rpaCredentials.password.keyVault}.vault.azure.net`;
        const client = new keyvaultSecrets.SecretClient(url, azCredential);
        const pwdSecret = await client.getSecret(config.rpaCredentials.password.secret);
        log(`Fetched password from the keyvault for ${config.rpaCredentials.userName}`);
        password = pwdSecret.value;
    }
    return {
        userName: config.rpaCredentials?.userName,
        password: password
    };
}

// Note the two following selectors must be kept in sync as they contain duplicate parts for attributes
const selectorRegex = /(?<role>\w+)?(?<attributes>(\[(?<attname>\w+)=(?<attvalue>("[^"]+")|('[^']+')|(true|false)|\d+)\])*)/g;
const selectorAttrRegex = /\[(?<attname>\w+)=(?<attvalue>("[^"]+")|('[^']+')|(true|false)|\d+)\]/g;
// Selects nodes using the selector syntax, e.g. dialog[modal=true] or button[name="Resolve Case"]
function selectNodes(root, selector, maxCount) {
    const matchSelector = parseSelector(selector);
    if (matchSelector) {
        // Now find the node
        return findNodes(root, node => matchSelector.match(node), maxCount);
    }
}
// Trim nodes from a tree matching the given selector
function trimNodes(root, includeSelector, excludeSelector) {
    const exclude = parseSelector(excludeSelector);
    const include = parseSelector(includeSelector);
    const trim = (node) => {
        if (exclude && exclude.match(node)) {
            // If an exlcusion list is given and the the node is on the exlcusion list, it is omitted along with all its children
            return null;
        }
        else if (include?.match(node)) {
            // If an inclusion list is given and the node is on the given inlcusion list, 
            // it is included along with all its children
            return node;
        }
        else {
            // Otherwise, if the node is a non-leaf node, it gets included if it has children upon trimming
            if (node?.children?.length > 0) {
                const trimmedChildren = node?.children?.map(c => trim(c))?.filter(c => !!c);
                if (trimmedChildren?.length > 0) {
                    return { ...node, children: trimmedChildren };
                }
            }
            else {
                // For the leaf node, it only gets default included if there is no inclusion list provided
                if (!include) {
                    return node;
                }
            }
        }
    };
    return trim(root);
}
function parseSelector(selector) {
    if (!selector) {
        return null;
    }
    const rules = Array.from(selector?.matchAll(selectorRegex)).map(selectorMatch => {
        // Role is not always required
        // Without role, any role will match
        let role = selectorMatch.groups?.["role"]?.toLowerCase();
        // Parse attributes if present
        const attributesSelector = selectorMatch.groups?.["attributes"];
        const attributes = [];
        if (attributesSelector) {
            for (const attrMatch of attributesSelector.matchAll(selectorAttrRegex)) {
                let attValue = attrMatch.groups["attvalue"];
                if (typeof attValue === "string" && attValue.charAt(0) == "'") {
                    // This is a single quote string literal, parse it out
                    attValue = attValue.substring(1, attValue.length - 1);
                }
                else {
                    // Parse as json
                    attValue = JSON.parse(attValue);
                }
                const attName = attrMatch.groups["attname"].toLowerCase();
                if (attName === 'role') {
                    // Role can also be specified as an attribute
                    role = attValue;
                }
                else {
                    attributes.push({
                        name: attName,
                        value: attValue
                    });
                }
            }
        }
        return { role, attributes };
    }).filter(i => !!i);
    if (rules?.length > 0) {
        return {
            match(node) {
                // As long there is at least one rule the node matches with, it will be a match
                return node && rules.find(rule => isNodeMatch(node, rule)) != null;
            }
        };
    }
    else {
        throw Error(`Invalid node selector ${selector}`);
    }
}
function isNodeMatch(node, rule) {
    // If the rule has neither a role or atrributes, then it is a void rule and nothing matches it
    if (!rule.role &&
        !(rule.attributes?.length > 0)) {
        return false;
    }
    // If rule has role, it must match
    // If the role does not match, then node is not a match
    if (rule.role &&
        node.role?.toLowerCase() !== rule.role) {
        return false;
    }
    // If rule has attributes, all of them must match
    // Any attribute NOT matching will make the node a non-match
    if (rule.attributes?.length > 0 &&
        rule.attributes.find(att => !isAttrMatch(node[att.name], att.value)) != null) {
        // Found a rule attribute that is not matching with the node attribute value
        return false;
    }
    // At this point, this node hasn't been discarded, so it is a match
    return true;
}
function isAttrMatch(attr, value) {
    if (typeof value === "boolean") {
        // Truthy or falsey
        return value ? (!!attr) : !attr;
    }
    else {
        // Use broad match
        return trim(attr) == value;
    }
}
function trim(value) {
    if (typeof value === "string") {
        return value.trim();
    }
    return value;
}
// Selects a node using the selector syntax
function selectNode(root, selector) {
    return selectNodes(root, selector, 1)?.[0];
}
// Finds nodes in a tree that are matching the given condition, starting from the given root node using depth-first algorithm
// Returns a collection of found nodes or undefined if none found
// maxCount can be specified to limit the search result to a max number
function findNodes(root, match, maxCount, exclude) {
    const stack = [root];
    const results = [];
    while (stack.length > 0) {
        const node = stack.pop();
        if (!node) {
            continue;
        }
        if (exclude && exclude(node)) {
            // Exclude the node and all its descendants
            continue;
        }
        if (match(node)) {
            // We found a match
            results.push(node);
            if (maxCount !== undefined && results.length >= maxCount) {
                // No need to search any more
                break;
            }
        }
        else {
            // Find any chidren and add them to the stack in reverse order so that they are popped in the original order
            // NOTE: we are skipping chidren from search if the parent is a match
            node.children?.map(n => n).reverse().forEach(c => stack.push(c));
        }
    }
    return results.length ? results : undefined;
}

async function trySetInputElement(page, element, elementName, value) {
    if (element) {
        if (!await isHidden(element)) {
            //log(`Found element ${await element.evaluate(el => el.outerHTML)}`)
            // Make sure the element is not readonly or disabled
            if (!await element.evaluate((el) => el.disabled || el.readOnly)) {
                // If the value is already same, no need to set again
                if (await element.evaluate((el) => el.value) == value) {
                    log(`Input currently has the same value, skipping - ${elementName}`);
                    return true;
                }
                log(`Setting value at ${elementName}`);
                //await element.evaluate((el: HTMLInputElement, val) => el.value = val, value);
                await element.focus();
                //log(`Setting value at ${elementName} focused`)
                // Ctrl+A to select any existing text
                await page.keyboard.down('Control');
                await page.keyboard.press('A');
                await page.keyboard.up('Control');
                //log(`Setting value at ${elementName} cleared`)
                await element.type(value, { delay: 50 });
                //log(`Setting value at ${elementName} typing`)
                // Tab out of the input
                await page.keyboard.press('Tab');
                //log(`Setting value at ${elementName} tabbing`)
                // If Fno, click the element to dismiss any flyouts
                // if(await page.evaluate(() => (window as any).$dyn != null)){
                //     await element.click({ delay: 50 });
                // }
                log(`Waiting for network operations to end`);
                // Setting inputs might cause async actions, wait for network to go idle
                await Promise.all([
                    promises.setTimeout(1000),
                    waitForNetworkIdle(page)
                ]);
                log(`Setting value at ${elementName} completed`);
                return true;
            }
            else {
                log(`Input is readonly or disabled: ${elementName}`);
            }
        }
        else {
            warn(`Input ${elementName} is not visible`);
        }
    }
    else {
        warn(`Input ${elementName} not found`);
    }
    return false;
}
async function tryClickElement(page, element, elementName) {
    if (element) {
        log(`Button found ${elementName}`);
        //log(`Found element ${await element.evaluate(el => el.outerHTML)}`)
        if (!await isHidden(element)) {
            // Make sure button is not disabled
            if (!await isDisabled(element)) {
                log(`Clicking a button ${elementName}`);
                //await element.focus();
                //await page.keyboard.press("Enter");
                await element.click();
                // By clicking, we might be still on the login page (e.g. when some more steps are remaining in the flow),
                // or we might be navigating away when the login flow completes
                log("Waiting for network to go idle or the page to navigate out");
                await Promise.all([
                    promises.setTimeout(1000),
                    Promise.any([
                        waitForNetworkIdle(page),
                        page.waitForNavigation()
                    ])
                ]);
                return true;
            }
            else {
                log(`Button ${elementName} is disabled, not clickable`);
            }
        }
        else {
            log(`Button ${elementName} is not visible`);
        }
    }
    else {
        log(`Button ${elementName} not found`);
    }
    return false;
}
async function isHidden(element) {
    // An element may be hidden by CSS
    return (await element.isHidden()) ||
        // Or it is off the screen, and has the aria-hidden attribute to indicate it's hidden
        (await element.evaluate(el => el.closest("[aria-hidden='true']") != null, element));
}
// Checks if a button element is disabled or not
async function isDisabled(element) {
    return await element.evaluate((el) => {
        if (el.disabled) {
            return true;
        }
        else {
            // In some of our apps, buttons are disabled without being ARIA-compliant and doesn't emit the disabled attribute
            // We have observed sometimes they are disabled by making them semi opaque.
            // Check opacity and decide based on that
            const opacity = parseFloat(window.getComputedStyle(el).opacity);
            if (!isNaN(opacity) && opacity < .7) {
                return true;
            }
        }
    });
}
async function withRetries(action, maxRetries, delayMS) {
    for (let iteration = 0; iteration < maxRetries; iteration++) {
        if (await action()) {
            return true;
        }
        // Wait a bit
        await waitFor(delayMS);
    }
    return false;
}

// *** NOTE ***
// This is monkey-patching an internal class function (Accessibility.serializeTree) from node_modules\puppeteer-core\lib\esm\puppeteer\cdp\Accessibility.js
// This modification is necessary as the official implementation is not exposing the backing DOM node ID in the resulting snapshot
// Node ID is required in order to get access to that element subsequently and use it
((prototype) => {
    prototype.baseSerializeTree = prototype.serializeTree;
    prototype.serializeTree = function (node, ...rest) {
        // Call the base first
        const [serializedNode] = this.baseSerializeTree(node, ...rest);
        serializedNode.nodeId = node.payload.backendDOMNodeId;
        return [serializedNode];
    };
})(puppeteer.Accessibility.prototype);
async function resolveAccessibleElement(page, nodeId) {
    return (await page.mainFrame().mainRealm().adoptBackendNode(nodeId));
}
async function getAccessibilitySnapshot(page, options) {
    return await page.accessibility.snapshot(options);
}

async function transformNodes(page, plugin, nodes, options) {
    if (!nodes)
        return;
    const results = [];
    for (const node of nodes) {
        if (!node) {
            continue;
        }
        (await plugin.transformSingleNode(page, node, options))?.forEach(item => results.push(item));
    }
    // Make sure there is no "null" in the result collection
    return results.filter(item => !!item);
}
// Transform a single node, which could result into a single or multiple nodes (e.g. when a container is flattended)
async function transformNode(page, plugin, node, options) {
    const role = node?.role?.toLowerCase();
    switch (role) {
        // Leaf elements
        case "labeltext":
        case "statictext":
        case "textbox":
        case "checkbox":
            // Children are ignored for these roles
            // Each leaf node must have a name
            if (node.name) {
                const { children, ...rest } = node;
                return [rest];
            }
            break;
        case "option":
            // Option is a passthrough text node, but we preserve its children in the output as they are used to understand individual parts of the option label
            if (node.name) {
                return [node];
            }
            break;
        case "link":
            return [transformLinkNode(node)];
        // Text container elements (text is aggregated from children)
        case "paragraph":
        case "listitem":
        case "alert":
            return [transformTextContainerNode(node)];
        case "heading":
            // Filter out non-static-text content (e.g. links) from headings
            return [transformTextContainerNode(node, { exceludeNodes: ["status", "link"] })];
        case "gridcell":
            // If readonly, process gridcells as text node, otherwise as containers
            if (options?.readonly) {
                return [transformTextContainerNode(node)];
            }
            else {
                return [await transformContainer(page, plugin, node, options)];
            }
        // Following containers are handled            
        case "dialog":
        case "region":
        case "menubar":
        case "grid":
        case "row":
        case "columnheader":
        case "tablist":
        case "tab":
        case "group":
            return [await transformContainer(page, plugin, node, options)];
        case "list":
            return [await transformList(page, node)];
        case "main":
            return [await transformMain(page, plugin, node, options)];
        // handle other special elements
        case "combobox":
            return [await transformComboBox(page, plugin, node, options)];
        case "button":
        case "menuitem":
            return [await transformButton(page, node)];
        // All others are pass-through nodes and their children are flattended to the current level
        // case "generic":
        // case "none":
        // case "presentation":
        // case "tabpanel":
        // case "section":
        // case "article":
        //case "region":
        default:
            return (await plugin.transformNodes(page, node.children, options));
    }
}
async function transformList(page, node) {
    // Determine if this is ordered or unordered list
    const listEl = await resolveAccessibleElement(page, node.nodeId);
    if (listEl) {
        const ordered = await listEl.evaluate((el) => el.tagName == "OL");
        // Find all list items, get their text content without the marker
        const children = selectNodes(node, "listitem")?.map(li => transformTextContainerNode(li, { exceludeNodes: ["listmarker"] }));
        return { ...node, ordered, children };
    }
}
function transformLinkNode(node) {
    // Link nodes are augmented with a value that represents inner text content
    const textContent = getTextContent(node, { includeNodes: ["statictext"] });
    // Remove children from the node
    const { children, ...rest } = node;
    return { ...rest, value: textContent };
}
function transformTextContainerNode(node, options) {
    // Only static text nodes from under this node will be preserved
    const textContent = (!node.name || options?.exceludeNodes || options?.includeNodes) ?
        getTextContent(node, options) :
        node.name;
    if (textContent) {
        const { children, name, ...rest } = node;
        return { name: textContent, ...rest };
    }
}
// Gets the text content of a node by looking into its children nodes
function getTextContent(node, options) {
    return findNodes(node, 
    // Include
    n => n !== node && !!n.name && (!options?.includeNodes || options.includeNodes.indexOf(n.role?.toLowerCase()) !== -1), null, 
    // Exclude
    n => (options?.exceludeNodes && options.exceludeNodes.indexOf(n.role?.toLowerCase()) >= 0))
        ?.map(n => n.name).join('');
}
async function transformMain(page, plugin, main, options) {
    // If main contains a form, we will use the form as the node
    const form = selectNode(main, "form");
    if (form) {
        return await transformContainer(page, plugin, form, options);
    }
    else {
        return await transformContainer(page, plugin, main, options);
    }
}
async function transformContainer(page, plugin, container, options) {
    // If main contains a form, we will use the form as the node
    return { ...container, children: await plugin.transformNodes(page, container.children, options) };
}
async function transformButton(page, button) {
    const buttonEl = await resolveAccessibleElement(page, button.nodeId);
    // Filter out certain properties
    const { disabled, children, ...rest } = button;
    return {
        // A button may be disabled by CSS and not on the AX tree, use our utility to ensure that
        disabled: button.disabled || await isDisabled(buttonEl),
        constrastRatio: await getElementContrastRatio(buttonEl),
        ...rest
    };
}
// Gets the contrast ratio of an element w.r.t its underlay
async function getElementContrastRatio(element) {
    const states = await element.evaluate(el => {
        const ifValidColor = (color) => color !== 'rgba(0, 0, 0, 0)' ? color : undefined;
        let underlayColor;
        const pos = el.getBoundingClientRect();
        for (const elfp of document.elementsFromPoint(pos.left + pos.width / 2, pos.top + pos.height / 2)) {
            if (elfp !== el) {
                underlayColor = ifValidColor(getComputedStyle(elfp).backgroundColor);
                if (underlayColor) {
                    // We found an element with background, stop here
                    break;
                }
            }
        }
        const styles = getComputedStyle(el);
        return {
            backgroundColor: ifValidColor(styles.backgroundColor),
            borderColor: parseInt(styles.borderWidth) > 0 ? ifValidColor(styles.borderColor) : undefined,
            //textColor: el.innerText?.length > 0 ? ifValidColor(styles.color) : undefined,
            underlayColor
        };
    });
    log(`Retrieved elements contrast states: ${JSON.stringify(states)}`);
    return Math.max(
    // Background color gets higher priority as it is more prominent
    // However, the score cannot exceed the standard max 21
    Math.min(3 * getColorContrastRatio(states.backgroundColor, states.underlayColor), 21), getColorContrastRatio(states.borderColor, states.underlayColor));
}
// Checks contrasts between two colors using WCAG standards https://www.w3.org/TR/2008/REC-WCAG20-20081211/#contrast-ratiodef
// If any of the color is not valid, contrast ratio is returned 0
function getColorContrastRatio(colorText1, colorText2) {
    const color1 = tinycolor(colorText1);
    const color2 = tinycolor(colorText2);
    if (color1.isValid() && color2.isValid()) {
        return Math.round(tinycolor.readability(color1, color2));
    }
    else {
        return 0;
    }
}
function getComboboxOptions(comboBoxPopup) {
    // Combobox comes in different flavors
    // When the popup is a "menu" look for menuitem roles
    // When the poup is a "listbox" look option roles
    // When the poup is a "dialog" look for a grid to select
    switch (comboBoxPopup?.role?.toLowerCase()) {
        case "menu": return selectNodes(comboBoxPopup, "menuitem");
        case "listbox": return selectNodes(comboBoxPopup, "option");
        default:
            // Look for a grid in the popup
            const rows = selectNodes(selectNode(comboBoxPopup, "grid"), "row");
            // Tansform grid to an option set
            const options = rows?.map(row => {
                const cells = selectNodes(row, "gridcell")?.map(cell => transformTextContainerNode(cell, { includeNodes: ["statictext"] })).filter(c => !!c);
                if (cells?.length > 0) {
                    // Limit to first 2 cells in the row
                    return {
                        role: "option",
                        value: cells[0].name, // TODO - Assuming first cell has the identifying value. This may not be necessarily true, find a better identification strategy.
                        name: cells.slice(0, 2).map(c => c?.name).join(" "),
                        nodeId: 0,
                        children: cells.slice(0, 2) // Include the children that contributed to the composite option name
                    };
                }
            }).filter(o => !!o);
            return options;
    }
}
async function transformComboBox(page, plugin, comboBox, options) {
    // Implemented according to the standards described in https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles/combobox_role
    // Find combobox options from the DOM or logical descendants
    const _getComboBoxOptions = (comboBoxPopup) => {
        const options = getComboboxOptions(comboBoxPopup);
        log(`Found ${options?.length ?? 0} options from combobox popup ${comboBox.name}`);
        return options;
    };
    // Combo-box may not have the options populated until it's expanded
    // Try looking for options directly under the element to see if we have any 
    let optionNodes = _getComboBoxOptions(comboBox);
    if (optionNodes) {
        log(`Found combo-box ${comboBox.name} options`);
    }
    else if (!options?.readonly) {
        //log(`Expanding combo-box ${comboBox.name} to find options`);
        // We need to expand the combo-box to to get its options
        // Find the combobox element
        const comboBoxEl = await resolveAccessibleElement(page, comboBox.nodeId); // await page.$(`::-p-aria(combobox[name="${cssEscape(comboBox.name)}"])`);
        if (comboBoxEl) {
            // Special case for FnO comboboxes
            const isFno = await comboBoxEl.evaluate(el => {
                const w = window;
                if (typeof w.$dyn?.context(el)?.ShowFlyout === "function") {
                    w.$dyn?.context(el)?.ShowFlyout(true);
                    return true;
                }
            });
            if (isFno) {
                // Wait for network to load
                await plugin.waitForUpdatesDone(page);
            }
            else {
                log(`Expanding combo-box ${comboBox.name} by clicking`);
                // Try to expand it by clicking it, then pressing Alt+Down
                await comboBoxEl.click();
                await page.keyboard.down("Alt");
                await comboBoxEl.press("ArrowDown");
                await page.keyboard.up("Alt");
                await plugin.waitForUpdatesDone(page);
            }
            // At this point the aria-expanded should be true and the aria-controls could be set to an element which is the popup
            const popupStates = await comboBoxEl.evaluate(el => {
                const expanded = el.getAttribute("aria-expanded") == "true";
                if (expanded) {
                    // Older impl may use aria-owns as opposed to aria-controls
                    const popupElId = el.getAttribute("aria-controls") ?? el.getAttribute("aria-owns");
                    return { expanded, popupElId };
                }
            });
            if (popupStates?.expanded) {
                log(`Combo-box ${comboBox.name} is expanded, inspecting its options`);
                // Fetch the popup element and its current accessibility
                const popupEl = popupStates.popupElId ?
                    await plugin.getById(page, popupStates.popupElId) :
                    // If no external popup, the element itself might have gotten loaded with elements
                    comboBoxEl;
                const popup = await plugin.getAccessibilitySnapshot(page, { root: popupEl, interestingOnly: false });
                log(`Combo-box ${comboBox.name} popup has role ${popup?.role}`);
                // Build options based on this
                optionNodes = _getComboBoxOptions(popup);
                // Now collapse the combo-box by tabbing out
                await Promise.all([page.keyboard.press("Tab"), waitFor(100)]);
                // If Fno, click the element to dismiss any flyouts
                // if(await page.evaluate(() => (window as any).$dyn != null)){
                //     await comboBoxEl.click({ delay: 50 });
                // }
                // Try body click in case the "tab out" didn't work
                await Promise.all([page.evaluate(() => document.body.click()), waitFor(50)]);
                log(`Combo-box ${comboBox.name} closed`);
            }
            else {
                log(`Combo-box ${comboBox.name} could not be expanded`);
            }
        }
        else {
            log(`Cannot expand, combo-box ${comboBox.name} element not found`);
        }
    }
    return { ...comboBox, children: await plugin.transformNodes(page, optionNodes, { readonly: true }) };
}

require('css.escape/css.escape.js');
function cssEscape(input) {
    return CSS.escape(input);
}

class CorePlugin {
    isSupported(page) {
        // Any page is supported as we use the default RPA mechanism 
        return Promise.resolve(true);
    }
    findElement(page, selector) {
        return page.$(selector);
    }
    tryClickElement(page, element, elementName) {
        return tryClickElement(page, element, elementName);
    }
    trySetInputElement(page, element, elementName, value) {
        return trySetInputElement(page, element, elementName, value);
    }
    getAccessibilitySnapshot(page, options) {
        return getAccessibilitySnapshot(page, options);
    }
    transformSingleNode(page, node, options) {
        return transformNode(page, this, node, options);
    }
    transformNodes(page, nodes, options) {
        return transformNodes(page, this, nodes, options);
    }
    async getById(page, id) {
        return this.findElement(page, `[id="${cssEscape(id)}"]`);
    }
    waitForUpdatesDone(page) {
        // By default wait for the network to go idle
        return waitForNetworkIdle(page);
    }
}

class FnoPlugin extends CorePlugin {
    isSupported(page) {
        return page.evaluate(() => !!window.$dyn);
    }
    async trySetInputElement(page, element, elementName, value) {
        log(`Trying to set value of '${elementName}' to '${value}' using FnO interaction handler`);
        const dynContext = await this.findControlContext(element);
        if (dynContext) {
            const inputType = await this.getControlTypeName(element, dynContext);
            switch (inputType) {
                case 'SegmentedEntry':
                    // SEC control values are set by calling special APIs
                    if (await this.trySetSegmentedEntryValue(page, element, elementName, value, dynContext)) {
                        return true;
                    }
                    break;
                default:
                    // This is the case for generic input
                    if (await element.evaluate((el, value, context) => {
                        const $dyn = window.$dyn;
                        if (context && typeof context.SetValue === 'function') {
                            // Trigger SetValue interaction
                            $dyn.callFunction(context.SetValue, context, [value]);
                            return true;
                        }
                        return false;
                    }, value, dynContext)) {
                        log(`Entered value directly using FnO interaction handler`);
                        await this.waitForClientNotBusy(page);
                        return true;
                    }
                    break;
            }
        }
        log(`!WARN! Falling back to RPA handler for entering value '${elementName}'`, TraceType.Verbose);
        // Fallback to the base
        return super.trySetInputElement(page, element, elementName, value);
    }
    async getAccessibilitySnapshot(page, options) {
        const result = await super.getAccessibilitySnapshot(page, options);
        if (result) {
            // FnO message bar messages do not show up on the accessibility tree (accessibility bug)
            // Look for any alert messages under the given root and then fill them up
            // Sometimes there are duplicate messages, make sure to only show unique messages
            const alerts = [...new Set(await page.evaluate(() => {
                    return Array.from(document.querySelectorAll(`form.active-form .messageBarSection-Warning .messageBar-message[title]`)).map((e) => e?.innerText);
                }))];
            if (alerts?.length > 0) {
                log(`Found ${alerts.length} alert on the page`);
                result.children = result.children ?? [];
                alerts.forEach(alert => {
                    result.children.unshift({
                        name: "⚠ " + alert,
                        role: "alert",
                        nodeId: 0
                    });
                });
            }
        }
        return result;
    }
    async tryClickElement(page, element, elementName) {
        log(`Trying to click button '${elementName}' using FnO interaction handler`);
        // if(element){
        //     log(`Found element ${await element.evaluate(el => el.outerHTML)}`)
        // }
        // If the element is an FnO server form button, we can trigger click directly
        if (element?.asElement() && await element.evaluate(el => {
            const $dyn = window.$dyn;
            const context = $dyn?.context?.(el);
            if (context) {
                if (context.TypeName === 'PivotItem' && typeof context.Activate === "function") {
                    context.Activate(new Event('click', { bubbles: true }));
                    return true;
                }
                else if (typeof context.Clicked === "function") {
                    context.Clicked(new Event('click', { bubbles: true }));
                    return true;
                }
            }
            return false;
        })) {
            log(`Performed button click directly using FnO interaction handler`);
            await this.waitForClientNotBusy(page);
            return true;
        }
        else {
            log(`!WARN! Falling back to RPA click for the button '${elementName}'`, TraceType.Verbose);
            // Fallback to the base
            return super.tryClickElement(page, element, elementName);
        }
    }
    waitForUpdatesDone(page) {
        // When client is done updating, the busy state resets
        // With this, we don't have to rely on imprecise network tracking
        return this.waitForClientNotBusy(page);
    }
    async transformSingleNode(page, node, options) {
        const role = node?.role?.toLowerCase();
        switch (role) {
            // Handle combobox for Fno forms
            case "combobox":
                return this.transformComboBox(page, node, options);
            default:
                return super.transformSingleNode(page, node, options);
        }
    }
    // Waits for client to be not busy based on FnO client's internal interaction processing states
    async waitForClientNotBusy(page) {
        log(`Waiting for FnO client interaction processing to be done`);
        await page.evaluate(() => {
            const $dyn = window.$dyn;
            if ($dyn) {
                return new Promise(resolve => {
                    // Framework may need some time to load, keep checking until they are loaded
                    const poll = window.setInterval(() => {
                        if ($dyn.observe && $dyn.clientBusy) {
                            clearInterval(poll);
                            $dyn.observe($dyn.clientBusy, (busy) => {
                                if (!busy) {
                                    resolve();
                                    return false;
                                }
                            });
                        }
                    }, 100);
                });
            }
        });
        log(`FnO client interaction processing is done`);
    }
    async transformComboBox(page, comboBox, options) {
        if (!options.readonly) {
            const comboBoxEl = await resolveAccessibleElement(page, comboBox.nodeId);
            // Find the server-form context of the control
            const dynContext = await this.findControlContext(comboBoxEl);
            // Check if it is a date or time control (we will need to load the supporting utility libs first)
            const inputType = await this.getControlTypeName(comboBoxEl, dynContext);
            // Date and time inputs are specially handled
            // They get converted to basic text inputs with the correct input-type annotation
            switch (inputType) {
                case "Date":
                    return [{ ...comboBox, role: "textbox", inputType: "date" }];
                case "Time":
                    return [{ ...comboBox, role: "textbox", inputType: "time" }];
                case "SegmentedEntry":
                    return this.transformSegmentedEntry(page, comboBox, comboBoxEl, options);
            }
            log(`Processing FnO combobox ${comboBox.name}`);
            // Lookup control popup opening -> let popupRootEl = $dyn.context($0).showPopup($dyn.observable())[0] <- returns the root element of the popup
            const popupRootEl = await comboBoxEl.evaluateHandle((el, context) => {
                if (!context)
                    return;
                const $dyn = window.$dyn;
                if (!context.isInGrid()) {
                    // If we are outside of the grid, we should find a context backing the element
                    return typeof context.showPopup === 'function' ? context.showPopup($dyn.observable())[0] : null;
                }
                else {
                    // Inside the grid, we have a column context to work with
                    const columnContext = context;
                    if (columnContext && typeof columnContext.testOpenLookup === 'function') {
                        columnContext.testOpenLookup();
                        // Now wait for the flyout to open
                        // Since this is async, return a promise
                        return new Promise(resolve => {
                            let resolved = false;
                            const disposable = $dyn.observe(columnContext.FlyoutId, (flyoutId) => {
                                if (flyoutId) {
                                    resolved = true;
                                    // Return the popup element pointed to by the flyout id
                                    resolve(document.getElementById(flyoutId));
                                    return false;
                                }
                            });
                            // Have a timeout of 10s in case the popup doesn't open for some reason
                            setTimeout(() => {
                                if (!resolved) {
                                    resolved = true;
                                    disposable.dispose();
                                    resolve(null);
                                }
                            }, 10000);
                        });
                    }
                }
            }, dynContext);
            let optionNodes;
            if (popupRootEl.asElement()) {
                // Popup content is loaded async, must wait for interactions to end
                await this.waitForClientNotBusy(page);
                // All FnO lookup flyouts are expected to have a grid with options to select from
                optionNodes = await popupRootEl.evaluate(el => {
                    const $dyn = window.$dyn;
                    const gridElement = el.querySelector("[role='grid']")?.closest("[data-dyn-serverid]");
                    if (gridElement) {
                        const gridControl = $dyn.context(gridElement);
                        const rows = gridControl?.dataCache?.modelCollection?.items();
                        // Filter columns to only 2, and those with simple binding
                        let columns = gridControl?.columnInfo;
                        // Filter columns to only a few
                        columns = columns?.filter(col => col.DataSourceName && col.FieldName).slice(0, 2);
                        if (rows && columns && columns.length > 0) {
                            return rows.map(row => {
                                const columnValues = columns.map((col) => row.getRelated(col.DataSourceName).getValue(col.FieldName));
                                return {
                                    role: "option",
                                    value: columnValues[0], // TODO - Assuming first cell has the identifying value. This may not be necessarily true, find a better identification strategy.
                                    name: columnValues.join(" "),
                                    nodeId: 0,
                                    children: columnValues.map(cv => ({ role: "statictext", name: cv, nodeId: 0 })) // Include the children that contributed to the composite option name
                                };
                            });
                        }
                    }
                });
                // Close the opened popup -> popupRootEl.RequestPopupClose()
                await popupRootEl.evaluate(el => el.RequestPopupClose());
                log(`Found ${optionNodes?.length ?? 0} options from Fno combobox popup ${comboBox.name}`);
                return [{ ...comboBox, children: await this.transformNodes(page, optionNodes, { readonly: true }) }];
            }
        }
        // Fallback to the base behavior
        log(`!WARN! Falling back to RPA inspection for the combobox '${comboBox.name}'`, TraceType.Verbose);
        return super.transformSingleNode(page, comboBox, options);
    }
    // Segmented entry control is a special control that needs special handling
    async transformSegmentedEntry(page, comboBox, comboBoxEl, options) {
        log(`Processing FnO segmented entry control ${comboBox.name}`);
        // Find the dyn context first
        const dynContext = await this.findControlContext(comboBoxEl);
        // Get the first segment options
        // Note, we are only handling first segment for now
        const secElements = await comboBoxEl.evaluate((el, context) => {
            const $dyn = window.$dyn;
            if (typeof context?.GetLookupValues === 'function') {
                return new Promise(resolve => {
                    $dyn.function(context.GetLookupValues)({
                        _filter: "",
                        _lastPagedTag: "",
                        _lastPagedValue: "",
                        _lookupCacheKey: "",
                        _segmentIndex: "0",
                        _showAllValues: "false"
                    }, (result) => resolve(result?.LookupElements));
                });
            }
        }, dynContext);
        const secOptions = secElements?.map(element => ({
            role: "option",
            value: element.Id,
            name: `${element.Description} (${element.Id})`,
            nodeId: 0,
        }));
        log(`Found ${secOptions?.length ?? 0} options from Fno segmented entry control ${comboBox.name}`);
        return [{ ...comboBox, children: await this.transformNodes(page, secOptions, { readonly: true }) }];
    }
    // Sets the SEC control value
    async trySetSegmentedEntryValue(page, element, elementName, value, dynContext) {
        if (await Promise.race([
            element.evaluate((el, value, context) => {
                const $dyn = window.$dyn;
                if (context &&
                    typeof context.ValueChanged === 'function' &&
                    typeof context.ResolveChanges === 'function') {
                    return new Promise(resolve => {
                        // Set the new value
                        $dyn.function(context.ValueChanged)({
                            _userInput: value,
                            _valueChangedByUser: "true",
                        }, () => {
                            window.setTimeout(() => {
                                // Resolve changes
                                $dyn.function(context.ResolveChanges)({}, () => {
                                    window.setTimeout(() => {
                                        // Resolve as success
                                        resolve(true);
                                    });
                                });
                            }, 100);
                        });
                    });
                }
                return false;
            }, value, dynContext),
            // Add a timeout of 20s (in case the FnO operation fails)
            waitFor(30000).then(() => false)
        ])) {
            log(`Entered segmented entry value directly using FnO interaction handler`);
            await this.waitForClientNotBusy(page);
            return true;
        }
    }
    // Finds the Server Form control context for the given control element inside the FnO web client page
    async findControlContext(controlEl) {
        return controlEl?.asElement() ? controlEl.evaluateHandle(el => {
            const $dyn = window.$dyn;
            const context = $dyn.context(el);
            if (context) {
                // If we are outside of the grid, we should find a context backing the element
                return context;
            }
            else {
                // If we are inside the grid, things are more complicated
                // We need to first find the ambient grid control
                const gridControl = el.closest("[role='grid']")?.closest("[data-dyn-serverid]");
                if (gridControl) {
                    const gridContext = $dyn.context(gridControl);
                    if (gridContext) {
                        // Then we find the column context, which represents the backing server control for the active editable row
                        const columnName = el.closest("[data-dyn-controlname]")?.getAttribute("data-dyn-controlname");
                        // If the column is a group, look for child columns as well for matching. 
                        // For a matching child, parent column context will be returned as that is what we would primarily want to interact with
                        const columnContext = gridContext.columnInfo?.find(c => c.Name === columnName || c.ChildNameToColIndex?.[columnName] !== undefined);
                        return columnContext;
                    }
                }
            }
        }) : null;
    }
    // Gets the type name of the server-form control
    async getControlTypeName(controlEl, dynContext) {
        return await controlEl.evaluate((el, context) => {
            return context?.TypeName;
        }, dynContext);
    }
}

async function findAsync(array, match) {
    if (array) {
        for (const item of array) {
            if (await match(item)) {
                return item;
            }
        }
    }
}

// Registration of all plugins
// Order matters as we call plugins in that order to see if they are supported on a given page or not
// Once we find a supported plugin, we do not look for more plugins
const pluginRegistry = [
    new FnoPlugin(),
    new CorePlugin()
];
// Cached page plugins
const pagePlugins = new WeakMap();
async function getPlugin(page) {
    let pagePlugin = pagePlugins.get(page);
    if (!pagePlugin) {
        pagePlugin = await findAsync(pluginRegistry, p => p.isSupported(page));
        if (pagePlugin) {
            pagePlugins.set(page, pagePlugin);
            // If the page is navigated, current plugin may not support it
            const navigationHandler = (frame) => {
                if (page.mainFrame() === frame) {
                    // Main frame navigated, remove plugin association
                    pagePlugins.delete(page);
                    page.off("framrnavigated", navigationHandler);
                }
            };
            page.on("framenavigated", navigationHandler);
        }
    }
    return pagePlugin;
}

async function tryClick(page, selector) {
    const plugin = await getPlugin(page);
    const element = await plugin.findElement(page, selector);
    return await plugin.tryClickElement(page, element, selector);
}
// Tries to set an input value if the input element exists
async function trySetInput(page, selector, value) {
    const plugin = await getPlugin(page);
    const element = await plugin.findElement(page, selector);
    return await plugin.trySetInputElement(page, element, selector, value);
}

// A deferred is a promise that can be resolved externally
class Deferred {
    constructor() {
        let _resolve;
        let _reject;
        this.esPromise = new Promise((resolve, reject) => {
            _resolve = resolve;
            _reject = reject;
        });
        this.resolveHandler = _resolve;
        this.rejectHandler = _reject;
    }
    resolve(value) {
        this.resolveHandler(value);
    }
    reject(reason) {
        this.rejectHandler(reason);
    }
    get promise() {
        return this.esPromise;
    }
}

class MonitorHub {
    // Singleton initialization
    static initialize(httpServer) {
        this.instance = new MonitorHub(new socket_io.Server(httpServer));
    }
    // Gets a client session instance given the session ID
    static getClient(sessionId) {
        return this.instance?.Client.get(sessionId);
    }
    constructor(server) {
        var _a;
        this.server = server;
        // Represents an instance of the client socket session
        // Since the underlying socket can disconnect and reconnect,
        // this instance maybe recreated for the same browser session's lifetime
        // DO NOT STORE reference of a client session. Always obtain the current
        // session using MonitorHub.getClient(sessionId)
        this.Client = (_a = class Client {
                constructor(socket) {
                    this.socket = socket;
                    this.liveViewState = "inactive";
                    this.bindEvent('start-session', this.start);
                    this.bindEvent('reconnect-session', this.reconnect);
                    this.bindEvent('start-liveview', this.startLiveView);
                    this.bindEvent('end-liveview', this.requestEndLiveView);
                    // If the socket gets disconnected, remove it from the session tracking after some delay
                    // The delay helps in case this is a temporary disconnection of the client
                    socket.on('disconnect', () => {
                        // Wait 5 minutes
                        setTimeout(() => {
                            if (this === _a.sessions.get(this.sessionId)) {
                                // Same socket instance, so delete
                                _a.sessions.delete(this.sessionId);
                            }
                        }, 5 * 60 * 1000);
                    });
                }
                sendLiveviewChunk(base64Chunk) {
                    if (this.liveViewState === 'inactive') {
                        // Can't send live-view chunk while the stream state is inactive
                        return false;
                    }
                    if (base64Chunk) {
                        // While chunks are being sent, the live-view state is in the 'streaming' mode
                        this.liveViewState = 'streaming';
                        this.socket.emit('liveview-chunk', base64Chunk);
                    }
                    else {
                        // a NULL chunk signals ending of the stream
                        this.endLiveView();
                    }
                    return true;
                }
                endLiveView() {
                    this.liveViewState = 'inactive';
                    this.socket.emit('liveview-end');
                }
                sendLogs(logs) {
                    return this.socket.emit('logs', logs);
                }
                get liveViewEnding() {
                    return this.liveViewState === "ending";
                }
                // Client requests starting live-view
                startLiveView() {
                    if (this.liveViewState === "inactive") {
                        log(`Requesting liveview streaming`);
                        this.liveViewState = "starting";
                    }
                }
                // Client requests ending live-view
                requestEndLiveView() {
                    if (this.liveViewState === 'streaming') {
                        log(`Ending liveview streaming`);
                        // Streaming has started, so must close gracefully
                        this.liveViewState = 'ending';
                        // Add a timeout handling of 5s to force close in case the graceful close loop fails
                        setTimeout(() => {
                            if (this.liveViewState === 'ending') {
                                this.endLiveView();
                            }
                        }, 5000);
                    }
                    else if (this.liveViewState === 'starting') {
                        // Streaming hasn't started, close it right away
                        this.endLiveView();
                    }
                }
                // Client starts a new session
                start() {
                    // Allocate a new session id for the socket connection
                    this.sessionId = uuid.v4();
                    _a.sessions.set(this.sessionId, this);
                    return this.sessionId;
                }
                // Replaces the socket for the given session
                reconnect(sessionId) {
                    this.sessionId = sessionId;
                    _a.sessions.set(sessionId, this);
                }
                bindEvent(eventName, handler) {
                    this.socket.on(eventName, (...args) => {
                        const ackCallback = args[args.length - 1];
                        const params = args.slice(0, args.length - 1);
                        ackCallback(handler.apply(this, [...params]));
                    });
                }
                static get(sessionId) {
                    return this.sessions.get(sessionId);
                }
            },
            _a.sessions = new Map(),
            _a);
        this.server.on('connection', socket => {
            // A connection event comes when the underlying socket connects or reconnects
            new this.Client(socket);
        });
    }
}
// Register a log-stream handler to push logs via the monitor session
registerLogStreamHandler({
    async sendLogs(context, logs) {
        if (context?.monitorSession) {
            const hubClient = MonitorHub.getClient(context.monitorSession);
            hubClient?.sendLogs(logs);
        }
    }
});

async function startLiveViewStreaming(page) {
    const traceParams = getTraceParams();
    if (config.monitor.enableLiveView &&
        /// Make sure that we have valid trace parameters to stream back live-views
        (traceParams?.monitorSession || traceParams?.remoteCallbackUrl) &&
        // Make sure the page is not already streaming live-view
        !activeLiveViews.has(page)) {
        const liveView = new Liveview(page, traceParams);
        // Start streaming
        await liveView.startStreaming();
        activeLiveViews.set(page, liveView);
    }
}
async function stopLiveViewStreaming(page) {
    const liveView = activeLiveViews.get(page);
    if (liveView) {
        await liveView.stopStreaming();
    }
}
function applyLiveViewLaunchOptions(launchOptions) {
    return { ...launchOptions, defaultViewport: { width: 1280, height: 720 } };
}
const activeLiveViews = new WeakMap();
class Liveview {
    constructor(page, traceParams) {
        this.page = page;
        this.traceParams = traceParams;
        this.streaming = false;
        // Streaming screenshots are maintained as base64 encoded images
        this.screenshotQueue = [];
        this.streamPushError = false;
    }
    async startStreaming() {
        log(`Starting liveview streaming`);
        if (!this.streaming) {
            this.streaming = true;
            const watcher = PageWatcher.get(this.page);
            // Captures screenshot every 100ms
            this.captureLoop = this.startInterval({
                action: async () => {
                    if (this.page.isClosed()) {
                        this.stopStreaming();
                        return false;
                    }
                    const lastContentChanged = watcher.lastContentChanged;
                    if (watcher.inflightNetwokRequestCount === 0 && (Date.now() - lastContentChanged) > 2000) {
                        // More than 2s of inactivity on this page, so we will not generate any more stream chunk until further activity happes
                        // Looping will continue
                        return true;
                    }
                    //log(`Capturing screenshot for live-view`)
                    try {
                        this.appendStreamChunk(await this.page.screenshot({
                            optimizeForSpeed: true,
                            type: "webp",
                            encoding: "base64"
                        }));
                        return true;
                    }
                    catch (error) {
                        warn(`Live view screenshot error ${error}`);
                        this.stopStreaming();
                        return false;
                    }
                },
                intervalMS: 100
            });
        }
    }
    // Stops any currently active streaming
    async stopStreaming() {
        if (this.streaming) {
            log(`Stopping liveview streaming`);
            this.captureLoop?.[Symbol.dispose]();
            this.captureLoop = null;
            activeLiveViews.delete(this.page);
            this.streaming = false;
            // NUll chunk signals end of stream to the client
            this.appendStreamChunk(null);
        }
    }
    appendStreamChunk(data) {
        this.screenshotQueue.push(data);
        this.flushStreamQueue();
    }
    // Starts a periodic async task
    startInterval(options) {
        let disposed = false;
        const loop = async () => {
            while (!disposed) {
                // Invoke action
                const continueLoop = await options.action();
                if (!continueLoop) {
                    break;
                }
                // Wait for an interval
                await new Promise((resolve) => {
                    setTimeout(() => resolve(), options.intervalMS);
                });
            }
        };
        // Start the loop async to not block current call
        setTimeout(() => loop());
        return {
            [Symbol.dispose]() {
                disposed = true;
                options.onDispose?.();
            }
        };
    }
    async flushStreamQueue() {
        if (!this.flushing && !this.streamPushError) {
            //log(`Pushing liveview stram chunk`, TraceType.Verbose);
            this.flushing = true;
            // One async queue to flush pending items
            globalThis.setTimeout(async () => {
                while (this.screenshotQueue.length > 0 && !this.streamPushError) {
                    const nextChunkb64 = this.screenshotQueue.shift();
                    try {
                        if (this.traceParams.monitorSession) {
                            // Get the monitor client instance for the session
                            const client = MonitorHub.getClient(this.traceParams.monitorSession);
                            if (client) {
                                //log(`Sending live-view chunk`)
                                if (!client.sendLiveviewChunk(nextChunkb64) || client.liveViewEnding) {
                                    // stream is closing, stop recording
                                    await this.stopStreaming();
                                }
                            }
                            else {
                                this.streamPushError = true;
                            }
                        }
                        else if (this.traceParams.remoteCallbackUrl) {
                            const response = await fetch(this.traceParams.remoteCallbackUrl + '/liveviewstream', {
                                method: 'post',
                                headers: {
                                    "Authorization": this.traceParams.remoteToken,
                                    'Content-Type': 'text/plain'
                                },
                                body: nextChunkb64
                            });
                            if (response.ok) {
                                if (response.headers.get("x-streamstate") == "closing") {
                                    // stream is closing, stop recording
                                    await this.stopStreaming();
                                }
                            }
                            else {
                                this.streamPushError = true;
                            }
                        }
                    }
                    catch (err) {
                        this.streamPushError = true;
                        warn(`Stream push error: ${err.message}`);
                    }
                    if (this.streamPushError) {
                        // Need to stop the stream as there was an error from the receiving end of the stream
                        await this.stopStreaming();
                    }
                }
                this.flushing = false;
            });
        }
    }
}

async function launchBrowser(userProfileName, headless, size, enableLiveView) {
    size = size ?? { width: 1920, height: 1080 };
    // Launch a new browser
    let launchOptions = {
        headless: headless,
        userDataDir: `./browser-profile/${userProfileName}`,
        defaultViewport: size,
        args: [
            `--window-size=${size.width},${size.height}`,
            '--content-shell-hide-toolbar',
            '--hide-crash-restore-bubble'
        ],
        ignoreDefaultArgs: ["--disable-extensions", "--enable-automation"],
    };
    if (enableLiveView) {
        launchOptions = applyLiveViewLaunchOptions(launchOptions);
    }
    return puppeteer.launch(launchOptions);
    //return (enableLiveView && config.monitor.enableLiveView) ? launchLiveViewBrowser(launchOptions) : puppeteer.launch(launchOptions);
}
async function deleteBrowserProfile(userProfileName) {
    const profileDir = `./browser-profile/${userProfileName}`;
    let dirExists = false;
    try {
        // Chekck if the dir exists
        await fs.promises.access(profileDir);
        dirExists = true;
    }
    catch {
        // Ignore
    }
    if (dirExists) {
        try {
            // Remove the directory
            await fs.promises.rm(profileDir, { recursive: true, force: true });
        }
        catch (ex) {
            warn(`Failed to delete user profile directory. ${ex}`);
        }
    }
}
// Maintains a pool of browser instances that can be used
class BrowserPool {
    constructor() {
        // Current idle and active pool
        this._idlePool = [];
        this._activePool = [];
        this._allocationCount = 0;
    }
    get maxAllocation() {
        // With manual login mode, only one browser instance can be used so that manually logged-in instance is utilized
        return config.loginMode == "manual" ? 1 : config.browserPool.maxCount;
    }
    // Acquire a browser slot from the pool
    // If there is no available capacity, the request will have to wait
    // Live-view required flag indicates whether we need a browser that can support live-view
    async acquire(liveViewRequired) {
        // Make sure that the live-view is enabled for the deployment
        liveViewRequired = liveViewRequired && config.monitor.enableLiveView;
        // Do we have any browser slot in the idle pool? If so, simply grab one from it and return
        let slot = await this.getAvailable(liveViewRequired);
        if (slot) {
            log(`Acquired available browser slot ${slot.profileName}`);
            return slot;
        }
        else {
            // Do we have capacity to allocate a new slot?
            if (this._allocationCount < this.maxAllocation) {
                // Allocate a new browser slot
                this._allocationCount++;
                slot = new BrowserSlot(config.loginMode == "manual" ? defaultUserProfileName : `pool-${this._allocationCount}`, liveViewRequired);
                // Add this to the active pool
                this._activePool.push(slot);
                log(`Allocated a new browser slot ${slot.profileName}`);
                return slot;
            }
            else {
                // Wait for next availability
                this._waitForAvailability = this._waitForAvailability ?? new Deferred();
                log(`Waiting for browser slot next availability`);
                const startTime = Date.now();
                while ((Date.now() - startTime) < (config.browserPool.timeoutSec * 1000)) {
                    await this._waitForAvailability?.promise;
                    slot = await this.getAvailable(liveViewRequired);
                    if (slot) {
                        log(`Acquired available browser slot ${slot.profileName}`);
                        return slot;
                    }
                    // Otherwise wait again
                    this._waitForAvailability = this._waitForAvailability ?? new Deferred();
                    log(`No slot available, waiting for browser slot next availability`);
                }
            }
        }
    }
    // Release a browser slot to the pool
    release(slot) {
        log(`Releasing browser slot ${slot.profileName}`);
        // remove from the active pool
        const activeIndex = this._activePool.indexOf(slot);
        if (activeIndex !== -1) {
            this._activePool.splice(activeIndex, 1);
        }
        // Add back to the idle pool
        if (this._idlePool.indexOf(slot) === -1) {
            this._idlePool.push(slot);
        }
        // Signal any waiting operation
        this._waitForAvailability?.resolve();
        // Clear out this waiting promise
        this._waitForAvailability = null;
    }
    // Tries to get an available slot
    // If a slot is live-view enabled, it can be used for both live-view and non-live requests
    async getAvailable(liveViewRequired) {
        if (this._idlePool.length > 0) {
            let availableSlot;
            if (liveViewRequired) {
                // Find first slot with live-view enabled
                const index = this._idlePool.findIndex(slot => slot.liveViewEnabled);
                if (index !== -1) {
                    // This is a live-view enabled slot that we can use
                    availableSlot = this._idlePool.splice(index, 1)[0];
                }
                else {
                    // No available slot is live-view enabled
                    // In this case, we need to pick the first available and recycle it for a live-view enabled
                    availableSlot = this._idlePool.shift();
                    await availableSlot.enableLiveView();
                }
            }
            else {
                availableSlot = this._idlePool.shift();
            }
            // Add this to the active pool
            this._activePool.push(availableSlot);
            return availableSlot;
        }
    }
}
const browserPool = new BrowserPool();
// A browser slot holds a place for a browser instance in a pool
class BrowserSlot {
    // Creates a browser slot with the given profile name
    // Every slot must have a unique profile or otherwise the first browser will lock the directory and others will fail to launch
    constructor(_profileName, _liveViewEnabled, _onDisconnected) {
        this._profileName = _profileName;
        this._liveViewEnabled = _liveViewEnabled;
        this._onDisconnected = _onDisconnected;
    }
    get profileName() {
        return this._profileName;
    }
    get liveViewEnabled() {
        return this._liveViewEnabled;
    }
    // Enables live-view on an existing slot
    // Closes the previous opened browser that didn't have the live-view enabled
    async enableLiveView() {
        if (this._liveViewEnabled) {
            // Already enabled
            return;
        }
        // If the browser-slot already has a browser but is not currently live-view enabled, we need to close the existing browser and re-open a new one
        if (this._browserAsync) {
            const browser = await this._browserAsync;
            await browser?.close();
            this._browserAsync = null;
            this._liveViewEnabled = true;
        }
    }
    // Gets the browser instance at this slot
    // If the slot has not been launched previously, it will be done so now
    async getBrowser() {
        if (!this._browserAsync) {
            this._browserAsync = (async () => {
                let browser;
                // Do we have an existing browser that we could connect to (from previous launch?)
                if (this._browserWSEndpoint) {
                    // This can fail if the browser actually crashed and we can't connect
                    try {
                        browser = await puppeteer.connect({ browserWSEndpoint: this._browserWSEndpoint });
                    }
                    catch (ex) {
                        warn(`Failed to connect to existing browser instance - ${ex}`);
                    }
                }
                if (!browser) {
                    log(`Launching browser`);
                    // Launch a new browser
                    browser = await launchBrowser(this._profileName, !config.debugMode, null, this.liveViewEnabled);
                    log(`Browser launched`);
                }
                if (browser) {
                    // Save the browser CDP endpoint, if we need to connect
                    this._browserWSEndpoint = browser.wsEndpoint();
                    // Browser can crash and close, or puppeteer may get disconnected after a timeout
                    // track that and clear out the brwoser and the page cache
                    browser.on("disconnected", () => {
                        warn("Browser disconnected");
                        this._browserAsync = null;
                        this._onDisconnected?.();
                    });
                    return browser;
                }
            })();
        }
        return await this._browserAsync;
    }
}

// Starts the login process during the process start-up
async function bootstrapLogin() {
    if (config.loginMode == "manual") {
        await loginDefaultUser();
    }
    else if (config.loginMode == "keyvault") {
        // We are using the on-demand mode, so acquire RPA credentials from AZ keyvault
        await getRPACredentials();
    }
    else if (config.loginMode != "none") {
        warn(`*** Unknown login mode ${config.loginMode} ***`);
    }
}
// Checks if we are on an AAD login page
function isAADLoginPage(page) {
    const url = new URL(page.url());
    if (url.host.toLowerCase() == "login.microsoftonline.com") {
        return true;
    }
    return false;
}
// Handles the login flow using the AAD login that we are aware of
async function handleLoginFlow(page) {
    if (config.loginMode === "manual") {
        // Manual login node cannot be handled on-demand
        // Process must be restarted with a new profile.
        warn(`!!! LOGIN SESSION EXPIRED. Must restart the process to perform manual re-login !!!`);
        // Pre-emptively Close the browser
        await page.browser().close();
        // Delete browser profile
        await deleteBrowserProfile(defaultUserProfileName);
        throw new Error(`Login session expired. Please restart the automation engine to perform manual re-login.`);
    }
    log("Handling login flow ...");
    const rpaCredentials = await getRPACredentials();
    // Login flow can have multiple steps
    // We will try to handle it without necessarily knowing the exact sequence of steps
    // A max no of steps (5) limits any potential stall
    for (let i = 0; i < 5; i++) {
        await trySetInput(page, "input[name=loginfmt]", rpaCredentials.userName);
        await trySetInput(page, "input[name=passwd]", rpaCredentials.password);
        if (!await tryClick(page, "input[type=submit]")) {
            // Sometimes AAD shows an account picker, select that
            await tryClick(page, `::-p-aria([name="Sign in with ${rpaCredentials.userName} work or school account."][role="button"])`);
        }
        // Wait for network to settle since any of the actions above may trigger network requests
        await waitForNetworkIdle(page);
        if (!isAADLoginPage(page)) {
            // Login successful
            log("Finished login flow ...");
            return true;
        }
    }
    // If we are still on the login page, we have not been able to pass the login flow
    warn("Login flow failed ...");
    return false;
}
// Logs in the default RPA user using interactive login triggered when the process is being launched
// All RPA requests will execute with the default user unless another user is specified on the request
// If the user has already been logged in before, this may not show any UI unless a re-login is required
async function loginDefaultUser() {
    log(`Launching silent AAD login flow`);
    // First launch a headless login page
    let page = await launchLoginPage(true);
    // If this is the AAD login-page, we need to re-login
    if (isAADLoginPage(page)) {
        // Close the previous opened browser, as we need to launch in headful way
        await page.browser().close();
        // Delete the existing user profile to avoid caching issues
        await deleteBrowserProfile(defaultUserProfileName);
        log(`No prior login session, launching interactive AAD login flow`);
        page = await launchLoginPage(false);
        await waitForPageNavigation(page, (url) => url?.startsWith(loginUrl));
        await page.browser().close();
        log(`*** Login successful ***`);
    }
    else {
        await page.browser().close();
        log(`*** Already logged in ***`);
    }
}
// Launches a login page in either headless or headful mode
async function launchLoginPage(headless) {
    // First launch a headless browser
    let browser = await launchBrowser(defaultUserProfileName, headless, { width: 800, height: 600 });
    // Chrome opens a start page by default. Find that target (of type 'page)
    const context = browser.defaultBrowserContext();
    const targets = context.targets();
    const pageTarget = targets.find(t => t.type() === 'page');
    const page = await pageTarget.page();
    await PageWatcher.start(page);
    await page.goto(loginUrl);
    await waitForPageNavigationEnd(page);
    return page;
}
const loginUrl = "https://myaccount.microsoft.com/";

var fno_inject_styles = "[data-dyn-image-type='Symbol']{ \r\n    display: none !important \r\n}\r\n.section-page-header:has(>.section-page-caption[aria-expanded=\"false\"]) {\r\n    display: none !important;\r\n}\r\n.appBarTab,\r\n.appBar-flyout,\r\n.actionGroup[data-dyn-controlname=\"SysCloseGroup\"],\r\n.actionGroup[data-dyn-controlname=\"SystemDefinedButtonsButtonGroup_Form\"]  {\r\n    display: none !important;\r\n}\r\n/* .fixedDataTableRowLayout_rowWrapper:has(.fixedDataTableLayout_header){\r\n    display: none !important;\r\n} */";

var mda_inject_styles = "[data-id=\"form-header\"]{\r\n    display: none !important;\r\n}\r\n[data-id^=\"outerHeaderContainer\"] button:not([role=\"menuitem\"]){\r\n    display: none !important;\r\n}";

function isNullOrUndefineOrEmpty(value) {
    return value === null || value === undefined || value === '';
}
async function arrayMapAsync(array, mapper) {
    if (array) {
        const results = [];
        for (const item of array) {
            results.push(await mapper(item));
        }
        return results;
    }
}
// Generates a random string using node-crypto
function cryptoRandomString(length) {
    if (length % 2 !== 0) {
        length++;
    }
    return node_crypto.randomBytes(length / 2).toString("hex");
}
function asString(arg) {
    if (typeof arg === "string") {
        return arg;
    }
}

const pageTimeout = 10 * 60 * 1000; // 10 mins in ms
// Page cache holds non-expired opened pages until they timeout
const pageCache = new Map();
const preloadedPageCache = new Map();
async function createPageSession(liveViewRequired) {
    log(`Crearting a page session`);
    // Session id is appended with a crypto random string so that it cannot be spoofed with bruteforce
    const sessionId = `${uuid.v4()}-${cryptoRandomString(10)}`;
    // Every page uses a separate browser instance
    // Grab a browser slot from the pool
    const browserSlot = await browserPool.acquire(liveViewRequired);
    // Launch the browser and open a new blank page
    const browser = await browserSlot.getBrowser();
    const page = await browser.newPage();
    //page.setBypassServiceWorker(true);
    await PageWatcher.start(page);
    // Set screen size
    //await page.setViewport({width: 1920, height: 1080});
    // When page is closed, we must release the browser slot
    page.on("close", async () => {
        log(`Page closed, session ${sessionId}`);
        try {
            // Stop any live-view for the page
            await stopLiveViewStreaming(page);
        }
        finally {
            browserPool.release(browserSlot);
        }
    });
    // Add page to the cache
    pageCache.set(sessionId, {
        page,
        browserSlot,
        timeoutHandle: setTimeout(() => pageSessionTimeoutHandler(sessionId), pageTimeout)
    });
    // If we are exceeding the max number of pages in the pool (5)
    // close older pages
    // if(pageCache.size > 5){
    //   const toDispose = [];
    //   for(const entry of pageCache.entries()){
    //     if(entry)
    //   }
    // }
    log(`Page session created, id: ${sessionId}`);
    return { sessionId, page };
}
async function loadPage(url, enableLiveView) {
    const { page, sessionId } = await createPageSession(enableLiveView);
    if (enableLiveView) {
        // Start live view streaming for this page
        await startLiveViewStreaming(page);
    }
    // Navigate the page to a URL
    log(`Starting page navigation, session: ${sessionId}`);
    await page.goto(url);
    // Make sure the page loads and settles down
    await waitForPageNavigationEnd(page);
    let error;
    let status = NavigationStatus.Success;
    // Are we on the login page?
    if (isAADLoginPage(page)) {
        // Handle the login flow first
        if (!await handleLoginFlow(page)) {
            warn("*** USER NOT LOGGED IN ***");
            status = NavigationStatus.LoginFailed;
            error = `You are not logged in`;
        }
    }
    if (status == NavigationStatus.Success) {
        const plugin = await getPlugin(page);
        // Make sure the page fully loads and settles down
        await plugin.waitForUpdatesDone(page);
    }
    return { page, sessionId, status, error, preloaded: false };
}
function getPreloadedPage(url, enableLiveView) {
    // Preloaded pages do not support live-view
    if (!enableLiveView && preloadedPageCache.has(url)) {
        const cached = preloadedPageCache.get(url);
        preloadedPageCache.delete(url);
        const pageSession = pageCache.get(cached.sessionId);
        if (pageSession) {
            log(`Using preloaded page`);
            pageSession.preloaded = false;
            return { ...cached, preloaded: true };
        }
    }
}
function pageSessionTimeoutHandler(sessionId) {
    warn(`Page session timing out, session-id ${sessionId}`);
    // Make sure we are still in the page cache
    const page = pageCache.get(sessionId)?.page;
    if (page) {
        // First remove it from the preloaded cache, if exists
        for (let [key, p] of preloadedPageCache.entries()) {
            if (p.sessionId === sessionId) {
                preloadedPageCache.delete(key);
                break;
            }
        }
        pageCache.delete(sessionId);
        page.close();
    }
}
// Gets sessions that are currently active
function getActiveUserSessions() {
    return [...pageCache.keys()].filter(sessionId => !pageCache.get(sessionId).preloaded);
}
async function preloadPage(url) {
    log(`---- Preloading a new page in cache ----`);
    // Load a page and add to the cache
    const cached = await loadPage(url, false);
    pageCache.get(cached.sessionId).preloaded = true;
    preloadedPageCache.set(url, cached);
    log(`---- Preloading page complete ----`);
}
async function closePageSession(sessionId) {
    log(`Closing page session, session-id ${sessionId}`);
    const { page, timeoutHandle } = pageCache.get(sessionId) ?? {};
    if (page) {
        // Remove from cache
        pageCache.delete(sessionId);
        // Clear out timeout
        clearTimeout(timeoutHandle);
        // Close the page
        await page.close();
    }
}
// Gets an existing page session, if it hasn't time out
function getPageSession(sessionId) {
    const pageCacheEntry = pageCache.get(sessionId);
    if (pageCacheEntry) {
        // Clear out existing timeout
        clearTimeout(pageCacheEntry.timeoutHandle);
        // Set a new timeout
        pageCacheEntry.timeoutHandle = setTimeout(() => pageSessionTimeoutHandler(sessionId), pageTimeout);
        return pageCacheEntry.page;
    }
}
// Inspects an element on the page based on the given selector
async function inspectElement(page, selector) {
    const plugin = await getPlugin(page);
    // Wait for any updates to settle down
    await plugin.waitForUpdatesDone(page);
    const snapshot = await plugin.getAccessibilitySnapshot(page, { interestingOnly: false });
    // Content selector, if not provided has some defaults
    log(`Inspecting element - ${selector}`);
    return selectNode(snapshot, selector);
}
// Inspects a page
async function inspectPage(page, selector, options) {
    const plugin = await getPlugin(page);
    // Wait for any updates to settle down
    await plugin.waitForUpdatesDone(page);
    const snapshot = await plugin.getAccessibilitySnapshot(page, { interestingOnly: false });
    // Content selector, if not provided has some defaults
    log(`Selecting content ${selector}`);
    let contentNode = selector ?
        selectNode(snapshot, selector) : (
    // Fallback to a sequence of important content roles in the given order
    selectNode(snapshot, "dialog") ??
        selectNode(snapshot, "main"));
    if (contentNode) {
        if (options?.exclude || options?.include) {
            log(`Triming content. Exclude: ${options.exclude ?? 'None'} Include: ${options.include ?? '*'}`);
            contentNode = trimNodes(contentNode, options.include, options.exclude);
        }
    }
    // Find any alert nodes, those will be included in the result
    const alerts = selectNodes(snapshot, "alert");
    const pageUrl = new URL(page.url());
    return { url: pageUrl.origin + pageUrl.pathname, contents: options?.raw ? [contentNode] : await plugin.transformNodes(page, [contentNode], options), alerts };
}
async function navigatePage(url, path, enableLiveView) {
    // if(url.indexOf("dynamics.com/main.aspx?") !== -1){
    //   const pageUrl = new URL(url);
    //   mdaPageType = pageUrl.searchParams.get("pagetype")
    //   mdaEtn = pageUrl.searchParams.get("etn")
    //   mdaRecordId = pageUrl.searchParams.get("id")
    //   pageUrl.searchParams.delete("pagetype")
    //   pageUrl.searchParams.delete("etn")
    //   pageUrl.searchParams.delete("id")
    //   // Use the updated url
    //   url = pageUrl.toString();
    // }
    log(`Navigating to ${url}`);
    let { sessionId, page, status, error, preloaded } = getPreloadedPage(url, enableLiveView) ?? await loadPage(url, enableLiveView);
    if (status === NavigationStatus.Success) {
        log(`Page loading complete!`);
        // TODO: special case for FnO via inspection
        if (await page.evaluate(() => window.$dyn != null)) {
            log(`Detected FnO page`);
            // It is FnO page
            // Fno Symbol buttons add non-legible characters to the accessible labels
            // Hide Symbols globally
            await page.evaluate((fno_inject_styles) => {
                const style = document.createElement('style');
                style.id = "automation-injected";
                style.innerHTML = fno_inject_styles;
                document.head.appendChild(style);
                // More hacks!
                // Inputs generate accessibility labels with values included, this messes up our selectors
                // Disable the label formatting
                window.Globalize.cultures['en-US'].messages["Input_FollowLink"] = ' ';
            }, fno_inject_styles);
        }
        // TODO: special case for MDA via inspection
        else if (await page.evaluate(() => window.Xrm != null)) {
            log(`Detected MDA page`);
            // Refresh page data, if preloaded, to avoid any stale data issue
            if (preloaded) {
                log(`Refreshing MDA page data`);
                await page.evaluate(() => window.Xrm.Page.data.refresh());
                log(`Refreshed MDA page data`);
            }
            // Inject CSS
            await page.evaluate((mda_inject_styles) => {
                const style = document.createElement('style');
                style.id = "automation-injected";
                style.innerHTML = mda_inject_styles;
                document.head.appendChild(style);
            }, mda_inject_styles);
        }
        // Do we have a path to process inside the loaded page?
        if (path) {
            // Path fragments are to be split into fragments
            // Each path fragment must be encoded with encodeURIComponent()
            const fragments = path.split(',');
            for (const f of fragments) {
                const fragment = decodeURIComponent(f);
                log(`Navigating to path - ${fragment}`);
                // Click each fragment (assuming they are buttons or tabs or other navigational elements)
                if (await withRetries(() => tryClick(page, `::-p-aria([name="${cssEscape(fragment)}"])`), 5, 500)) {
                    log(`Navigated to path - ${fragment}`);
                }
                else {
                    // Path fragment not found, which leads to path not found error even though we have partially navigated
                    status = NavigationStatus.PathNotFound;
                    error = `Invalid navigation path - ${fragment}`;
                    break;
                }
            }
        }
    }
    // Finally return everything
    return { sessionId, page, appUrl: url, status, error };
}
async function applyPageInputs(page, inputs) {
    if (inputs) {
        const plugin = await getPlugin(page);
        let success = true;
        for (const input of inputs) {
            log(`Handling input ${input.id}`);
            const inputElement = await resolveAccessibleElement(page, parseInt(input.id));
            if (inputElement) {
                if (!await plugin.trySetInputElement(page, inputElement, input.id, input.value)) {
                    warn(`Input ${input.id} value could not be set`);
                    success = false;
                }
            }
            else {
                warn(`Input ${input.id} not found`);
                success = false;
            }
        }
        return success;
    }
}
async function executeAction(page, targetId, inputs) {
    let status = ActionStatus.Success;
    const plugin = await getPlugin(page);
    // Make sure the page is active
    await page.bringToFront();
    if (await applyPageInputs(page, inputs) === false) {
        status = ActionStatus.InvalidInput;
    }
    // Now execute the action
    const actionElement = await resolveAccessibleElement(page, parseInt(targetId));
    if (actionElement) {
        if (!await plugin.tryClickElement(page, actionElement, targetId)) {
            warn(`Action element ${targetId} could not be clicked`);
            status = ActionStatus.Failed;
        }
    }
    else {
        warn(`Action element ${targetId} not found`);
        status = ActionStatus.TargetNotFound;
    }
    return { status };
}
var NavigationStatus;
(function (NavigationStatus) {
    NavigationStatus[NavigationStatus["Success"] = 0] = "Success";
    NavigationStatus[NavigationStatus["PathNotFound"] = 1] = "PathNotFound";
    NavigationStatus[NavigationStatus["LoginFailed"] = 2] = "LoginFailed";
    NavigationStatus[NavigationStatus["Failed"] = 3] = "Failed";
})(NavigationStatus || (NavigationStatus = {}));
var ActionStatus;
(function (ActionStatus) {
    ActionStatus[ActionStatus["Success"] = 0] = "Success";
    ActionStatus[ActionStatus["TargetNotFound"] = 1] = "TargetNotFound";
    ActionStatus[ActionStatus["InvalidInput"] = 2] = "InvalidInput";
    ActionStatus[ActionStatus["Failed"] = 3] = "Failed";
})(ActionStatus || (ActionStatus = {}));

class AutomationError extends Error {
    constructor(message) {
        super(message);
        warn(`${message}\n${this.stack}`);
    }
}
class DSLSyntaxError extends AutomationError {
}
class InterpreterError extends AutomationError {
}

// Compiled view cache
const viewCache = new Map();
// Allows EJS includes to work with relative path w.r.t. the calling view
function ejsIncludeHandler(parentPath) {
    return (includePath, data) => {
        // Render the included file
        // If include-path starts with '?', then it is optional and we must check whether it exists or not first
        let allowNonExisting = false;
        if (includePath.startsWith('?')) {
            includePath = includePath.substring(1);
            allowNonExisting = true;
        }
        // File path of the included file will be based on any relative path and 
        // the root which is the location where the current script is executing
        const filePath = path.join(parentPath, includePath);
        // Actual file loader
        const loadFile = () => {
            try {
                //log(`Loading EJS file - ${filePath}`)
                // It is expected that the files are available in location w.r.t the executing script
                return fs.readFileSync(filePath).toString();
            }
            catch (err) {
                if (err.code === 'ENOENT' && allowNonExisting) {
                    // It is okay for the file to not exist
                    return "";
                }
                else {
                    throw err;
                }
            }
        };
        // Handle specific formatting needed based on the file
        if (filePath.endsWith(".ejs")) {
            // EJS files are rendered with the ejs system
            return ejs.render(loadFile(), { include: ejsIncludeHandler(path.join(parentPath, path.dirname(includePath))) });
        }
        else if (filePath.endsWith(".md")) {
            // Mark-down files are converted using the markdown to HTML converter
            return marked.marked.parse(loadFile());
        }
        else if (filePath.endsWith(".js")) {
            // JS files are wrapped in a <script> tag
            let content = loadFile();
            // If the file contains any </script> inside, it will terminate the outer <script> tag
            // Escape such nested script
            content = content.replaceAll(/\<\/script\>/g, "<\\/script>");
            return `<script>${content}\n//# sourceURL=${includePath}</script>`;
        }
        else if (filePath.endsWith(".css")) {
            // CSS files are wrapped in a <style> tag
            return `<style>${loadFile()}</style>`;
        }
        else if (filePath.endsWith(".html")) {
            // HTML files are emitted as-is
            return loadFile();
        }
        else {
            throw new Error(`Unsupported file type - ${filePath}`);
        }
    };
}
async function renderView(viewName) {
    if (viewCache.has(viewName)) {
        return viewCache.get(viewName);
    }
    else {
        // Compile the view
        // All view files are expected to be in the /views folder w.r.t. the executing script
        const viewsDir = path.join(__dirname, "/views");
        // Views are rendered with the top layout
        const viewContent = await ejs.renderFile(path.join(viewsDir, "layout.ejs"), {
            view: viewName,
            include: ejsIncludeHandler(viewsDir)
        });
        viewCache.set(viewName, viewContent);
        return viewContent;
    }
}
function registerViewRoutes(app) {
    // Allow static resource files to be served from /public
    app.use("/public", express.static(path.join(__dirname, "public")));
    // Enumerate all the view names, which are directories under the /views path
    // Views are expected to be present in the /views directory next to the executing script
    const viewNames = fs.readdirSync(path.join(__dirname, "views"), { withFileTypes: true })
        // Directories starting with _ are considered non-view and used for other resources
        .filter(e => e.isDirectory() && !e.name.startsWith('_'))
        .map(e => e.name);
    viewNames.forEach(viewName => {
        log(`Registering view route - /${viewName}`);
        app.get(`/${viewName === "index" ? "" : viewName}`, async (req, res) => {
            const viewHTML = await renderView(viewName);
            res.status(200).type('.html').send(viewHTML);
        });
    });
}

class Interpreter {
    // Interpreter instance is created bound to a host. Host object's prototype determines which DSL functions are available
    constructor(script, host, options) {
        this.options = options;
        this.jsInterpreter = new JsInterpreter(script, (jsInterpreter, globalObject) => {
            this.initializeInstance(jsInterpreter, globalObject, host);
        });
    }
    /**
     * Gets the current status of the interpreter
     */
    get status() {
        switch (this.jsInterpreter.getStatus()) {
            case JsInterpreter.Status.STEP: return InterpreterStatus.Ready;
            case JsInterpreter.Status.DONE: return InterpreterStatus.Done;
            default: return InterpreterStatus.Paused;
        }
    }
    /**
     * Executes the progam loaded in the interprter and runs until it completes or gets blocked by an async operation in the yield state
     * @returns true if the execution is complete, or, false if the interpreter is yielding its flow of execution to the caller as required by an async operation executing inside it
     */
    async execute() {
        // If we have a yield pending, resolve that first
        if (this.yieldPending) {
            const currentYieldPending = this.yieldPending;
            this.yieldPending = null;
            currentYieldPending.resolve();
        }
        while (this.jsInterpreter.run()) {
            // Reaching here means that interpreter is waiting on an async operation
            // This should correspond to an async pending state 
            if (!this.asyncPending) {
                throw new InterpreterError("Unexpected runaway async operation");
            }
            // Do we already have a yield pending?
            // This can happen if the yield operation is triggered during the initial synchronous initiation of an async operation
            if (this.yieldPending) {
                // We are now yielding
                log(`Interpreter - async operation yielded`);
                return false;
            }
            // Otherwise, wait for the async operation to reach its end state or yield state
            log(`Interpreter - waiting on an async operation`);
            const asyncNextState = await this.asyncPending.promise;
            log(`Interpreter - async operation ${asyncNextState ? 'completed' : 'yielded'}`);
            if (asyncNextState === false) {
                // Async pending resolving as false means we are in an yield state
                return false;
            }
        }
        return true;
    }
    /**
     * Yield can be called only when an async operation is pending
     * This allows the execute() call to yield to the caller so that they can call again later.
     * @returns a promise which is resolved when the caller continues again after the yield
    */
    async yield() {
        if (this.yieldPending) {
            throw new InterpreterError("Unexpected yield call while another yield is still pending");
        }
        if (this.asyncPending) {
            // Current async promise will be resolved with false
            const currentAsyncPending = this.asyncPending;
            // Create a new async pending will be used to track the progress of the async operation
            this.asyncPending = new Deferred();
            this.yieldPending = new Deferred();
            log(`Interpreter - async operation is yielding`);
            currentAsyncPending.resolve(false);
            //log(`Interpreter - async operation yielded from source`)
            return this.yieldPending.promise;
        }
        else {
            throw new InterpreterError("Unexpected yield call outside of an async function");
        }
    }
    appendCode(code) {
        this.jsInterpreter.appendCode(code);
    }
    /**
     * Intiailizes an interpreter instance bound to a host object
     * @param jsInterpreter
     * @param globalObject
     * @param host
     */
    initializeInstance(jsInterpreter, globalObject, host) {
        // Retrieve registered functions
        const functions = _dslFunctions.get(host.constructor?.prototype);
        const self = this;
        if (functions) {
            // Initialize each function (all functions are assumed async)
            functions.forEach(fnMetadata => {
                //log(`Registering script function ${fnMetadata.name}`)
                const fn = fnMetadata.static ? host.constructor[fnMetadata.propertyKey] : host[fnMetadata.propertyKey];
                if (fn) {
                    // We need to create a wrapper function that must match the number of parameters expected + the async callback
                    // Then a proxy function goes under the wrapper and marshalls the call to the real function
                    const proxy = async (proxyArgs) => {
                        if (self.asyncPending) {
                            // Only one async native function can execute at a time
                            // This is because there is no way to re-enter into interpreted code back from native async functions without finishing execution of the current
                            throw new InterpreterError("Unexpected async call while another is still executing");
                        }
                        // Create a new async pending state
                        self.asyncPending = new Deferred();
                        // Last argument passed in by the interpreter is the calbback
                        const doneCallback = proxyArgs.pop();
                        // Convert rest of the args to native JS values
                        const fnArgs = proxyArgs.map(a => jsInterpreter.pseudoToNative(a));
                        await Promise.resolve(self.options?.onEnterHostFunction?.(fnMetadata.name));
                        log(`--- Executing DSL function ${fnMetadata.name} ---`);
                        let result;
                        try {
                            result = await Promise.resolve(fn.apply(fnMetadata.static ? host.constructor : host, fnArgs));
                        }
                        catch (hostFnError) {
                            // Host function can throw an error
                            // We do not pass that error back to the interpreter
                            // It is handed back to the host to do something or otherwise it will be ignored
                            await Promise.resolve(self.options?.onErrorHostFunction?.(fnMetadata.name, hostFnError));
                        }
                        await Promise.resolve(self.options?.onExitHostFunction?.(fnMetadata.name));
                        doneCallback(result);
                        const asyncPending = self.asyncPending;
                        self.asyncPending = null;
                        asyncPending.resolve(true);
                    };
                    const wrapper = new Function('proxy', `return function(${Array.from(Array(fn.length + 1)).map((v, index) => `p${index + 1}`).join(',')}){ proxy(Array.from(arguments))};`).call(null, proxy);
                    jsInterpreter.setProperty(globalObject, fnMetadata.name, jsInterpreter.createAsyncFunction(wrapper));
                    //log(`Registered script function ${fnMetadata.name}`)
                }
            });
        }
    }
}
let libDefConent;
// Compiles the given DSL script and performs syntax checking. 
// If the compilation fails, a SyntaxError exeception is thrown. 
// Otherwise, the function returns the ESTree node for the program which can be passed into the interpreter
async function compileScript(script) {
    let messages;
    let scriptSource;
    try {
        if (!libDefConent) {
            // Load the lib-definition file
            libDefConent = (await fs.promises.readFile(path.join(__dirname, './dsl.lib.d.ts'))).toString();
        }
        scriptSource = ts__namespace.createSourceFile("script.ts", `${script}`, ts__namespace.ScriptTarget.Latest);
        const libSource = ts__namespace.createSourceFile("dsl.lib.d.ts", libDefConent, ts__namespace.ScriptTarget.Latest);
        const customCompilerHost = {
            getSourceFile: (name, languageVersion) => {
                if (name === scriptSource.fileName) {
                    return scriptSource;
                }
                else if (name === libSource.fileName) {
                    return libSource;
                }
                else {
                    warn(`Unexpected TS source file request ${name}`);
                }
            },
            writeFile: (filename, data) => { },
            getDefaultLibFileName: () => {
                return libSource.fileName;
            },
            useCaseSensitiveFileNames: () => false,
            getCanonicalFileName: filename => filename,
            getCurrentDirectory: () => "",
            getNewLine: () => "\n",
            getDirectories: () => [],
            fileExists: () => true,
            readFile: () => ""
        };
        const program = ts__namespace.createProgram(["script.ts"], {}, customCompilerHost);
        const diagnostics = ts__namespace.getPreEmitDiagnostics(program);
        messages = [];
        // Process errors and warnings
        for (const diagnostic of diagnostics?.filter(d => d.category <= 1)) {
            const message = (typeof diagnostic.messageText === 'string') ? diagnostic.messageText : flattenDiagnosticMessageChain(diagnostic.messageText).join('. ');
            const file = diagnostic.file;
            if (file && file.fileName == "script.ts") {
                const lineAndChar = file?.getLineAndCharacterOfPosition(diagnostic.start);
                const line = lineAndChar.line + 1;
                const character = lineAndChar.character + 1;
                messages.push(`(script:${line}:${character}) ${message}`);
            }
            else {
                messages.push(message);
            }
        }
    }
    catch (error) {
        warn(`Compiler exception: ${error.message}\n${error.stack}`);
    }
    if (messages?.length > 0) {
        const errorMessage = `Your script has error(s):\n${messages.join('\n')}`;
        warn(errorMessage);
        throw new DSLSyntaxError(errorMessage);
    }
    // If we don't have errors, parse the script again via Babel and down-compile to ES5 as that is what the interpreter supports
    // Convert the ES6+ AST to ES5 (which is what the interpreter supports) using Babel
    const result = await core.transformAsync(script, { ast: true, presets: ['@babel/preset-env'] });
    log(`Compiled AST, found statements ${result.ast?.program?.body?.length ?? 0}`);
    return result?.code;
}
function flattenDiagnosticMessageChain(chain) {
    const messages = [chain.messageText];
    chain.next?.forEach(nextChain => {
        messages.push(...flattenDiagnosticMessageChain(nextChain));
    });
    return messages;
}
// DSL function decorator
function dslFunction(name) {
    return function (target, propertyKey, descriptor) {
        if (target.prototype && target.prototype.constructor === target) {
            // target is a constructor function, so this is a static method
            registerDSLFunction(target.prototype, { name, propertyKey, static: true });
        }
        else {
            registerDSLFunction(target, { name, propertyKey, static: false });
        }
    };
}
function registerDSLFunction(prototype, fn) {
    let metadata = _dslFunctions.get(prototype);
    if (!metadata) {
        metadata = [];
        _dslFunctions.set(prototype, metadata);
    }
    metadata.push(fn);
}
const _dslFunctions = new WeakMap();
var InterpreterStatus;
(function (InterpreterStatus) {
    /**
     * Interpreter is ready to start executing
     */
    InterpreterStatus[InterpreterStatus["Ready"] = 0] = "Ready";
    /**
     * Interpreter has finished the execution
     */
    InterpreterStatus[InterpreterStatus["Done"] = 1] = "Done";
    /**
     * Interpreter is waitig on yield continuation, call execute() again to continue
     */
    InterpreterStatus[InterpreterStatus["Paused"] = 2] = "Paused";
})(InterpreterStatus || (InterpreterStatus = {}));

// Either use the open-ai service or azure open-ai
// If nothing is configured, this will be null
let openai;
function intializeOpenAiClient() {
    openai = config.azureOpenai ?
        new OpenAI.AzureOpenAI({ apiVersion: '2024-06-01', endpoint: config.azureOpenai.endpoint, apiKey: config.azureOpenai.key }) :
        new OpenAI({ apiKey: config.openaiApiKey });
}
// Default initialization on boot
intializeOpenAiClient();
class TaskAssistant {
    constructor() {
        // Messages in the session
        this.inputResolutionMessages = [{ role: 'system', content: TaskAssistant.predictSystemPrompt }];
        this.summarizeContextMessages = [];
    }
    addUserMessage(message) {
        const chat = { role: 'user', content: message };
        this.inputResolutionMessages.push(chat);
        //this.summarizeMessages.push(chat);
    }
    addSystemMessage(message) {
        const chat = { role: 'system', content: message };
        this.inputResolutionMessages.push(chat);
        this.summarizeContextMessages.push(chat);
    }
    async resolveStepInputs(step) {
        const formattedInputs = step.inputs.map(input => {
            // Only if there are 20 or less choices, we will include them in the prompt
            // Otherwise will use choice disambigation later
            const formattedChoices = (input.choices?.length > 0 && input.choices?.length <= 20) ? `("examples:" ${input.choices.map(c => c.labels).flat().map(l => `"${l}"`).join(', ')})` : '';
            return `- ${input.label} ${formattedChoices}`;
        }).join('\n');
        const formattedMessage = `Form title: ${step.title}\nInputs needed:\n${formattedInputs}`;
        log(`--- Resolving step inputs ---\n${formattedMessage.replaceAll('\n', ' ')}`);
        this.inputResolutionMessages.push({ role: 'user', content: formattedMessage });
        const chatCompletion = await openai.chat.completions.create({
            messages: this.inputResolutionMessages,
            model: config.openaiModels.taskAssistant,
            response_format: { type: 'json_object' },
            max_tokens: 512,
            temperature: .2
        });
        const llmMessage = chatCompletion.choices?.[0]?.message;
        if (llmMessage) {
            try {
                log(`LLM response ${llmMessage.content}`);
                const resolvedValues = JSON.parse(llmMessage.content);
                this.inputResolutionMessages.push(llmMessage);
                if (resolvedValues) {
                    let autoResolvedCount = 0;
                    let unresolvedCount = 0;
                    let unresolvedRequiredCount = 0;
                    const outputs = (await arrayMapAsync(step.inputs, async (input) => {
                        const resolvedValue = resolvedValues[input.label];
                        if (resolvedValue) {
                            if (input.choices) {
                                // Is this an exact choice?
                                let matchedChoice = input.choices.find(c => c.labels.indexOf(resolvedValue) !== -1);
                                if (!matchedChoice) {
                                    // It is a non-exact choice, so match against other choices using fuzzy matching
                                    const fuseOptions = {
                                        keys: ["label"],
                                        isCaseSensitive: true
                                    };
                                    // Make sure to take only unique labels from each choice
                                    const choices = input.choices.map(choice => [...new Set(choice.labels)].map(label => ({ label, choice }))).flat();
                                    let fuse = new Fuse(choices, fuseOptions);
                                    let searchResults = fuse.search(resolvedValue)?.map(r => r.item);
                                    //let searchResults = choices;
                                    log(`Fuse search results: ${JSON.stringify(searchResults)}`);
                                    if (searchResults?.length > 1) {
                                        // More than one search result means we need to use LLM to disambiguate
                                        const bestMatch = await this.selectChoice(resolvedValue, searchResults?.map(s => s.label));
                                        if (bestMatch && bestMatch != "null") {
                                            // LLM may still not return an exact match, so use Fuse to find the top closest
                                            fuse = new Fuse(searchResults.map(s => s), fuseOptions);
                                            searchResults = fuse.search(bestMatch)?.map(r => r.item);
                                            log(`Fuse best match results: ${JSON.stringify(searchResults)}`);
                                            matchedChoice = searchResults?.[0]?.choice;
                                        }
                                    }
                                    else {
                                        matchedChoice = searchResults?.[0]?.choice;
                                    }
                                }
                                if (matchedChoice) {
                                    autoResolvedCount++;
                                    log(`Resolved choice for '${input.label}' with '${matchedChoice.value}'`);
                                    return { id: input.id, choice: matchedChoice };
                                }
                            }
                            else {
                                // The value is the input
                                autoResolvedCount++;
                                log(`Resolved value for '${input.label}' with '${resolvedValue}'`);
                                return { id: input.id, value: resolvedValue };
                            }
                        }
                        // We couldn't resolve a value
                        // If the input already has a value, then it doesn't count against unresolved
                        if (isNullOrUndefineOrEmpty(input.value)) {
                            unresolvedCount++;
                            if (input.required) {
                                unresolvedRequiredCount++;
                            }
                        }
                    })).filter(c => !!c);
                    log(`--- ${autoResolvedCount} inputs auto resolved, ${unresolvedRequiredCount} still required but unresolved ---`);
                    return { allResolved: unresolvedRequiredCount === 0, outputs };
                }
            }
            catch {
                warn(`Invalid JSON response from LLM: ${llmMessage.content}`);
            }
        }
    }
    // Summarizes a step
    async summarizeStep(step, asNextAction) {
        const formattedInputs = step.inputs.map(input => {
            let value = input.value;
            // Do we have choices? If so, we need to lookup the choice matching the value and then get its label
            const choice = input.choices?.find(c => c.value == value);
            if (choice) {
                value = choice.labels.join(' ');
            }
            return `- ${input.label}: "${value ?? ''}"`;
        }).join('\n');
        const formattedMessage = `Title: ${step.title}\nFields:\n${formattedInputs.replaceAll('\n', ' ')}`;
        log(`--- Summarizing ${asNextAction ? "next step" : "last step"} ---\n${formattedMessage}`);
        const chatCompletion = await openai.chat.completions.create({
            messages: [
                ...this.summarizeContextMessages,
                { role: 'system', content: TaskAssistant.summarizeSystemPrompt(asNextAction) },
                { role: 'user', content: formattedMessage }
            ],
            model: config.openaiModels.taskAssistant,
            max_tokens: 512,
            temperature: .2
        });
        const summary = chatCompletion.choices?.[0]?.message?.content;
        log(`--- Step summary ---\n${summary}`);
        return summary;
    }
    async selectChoice(text, candidates) {
        const formattedMessage = `Text:\n${text}\n\nOptions:\n${candidates.map(c => `${c}`).join('\n')}`;
        log(`--- Selecting choice ---\n${formattedMessage}`);
        const chatCompletion = await openai.chat.completions.create({
            messages: [
                { role: 'system', content: TaskAssistant.choiceSelectionPrompt },
                { role: 'user', content: formattedMessage }
            ],
            model: config.openaiModels.taskAssistant,
            max_tokens: 512
        });
        const selection = chatCompletion.choices?.[0]?.message?.content;
        log(`--- Selected choice ---\n${selection}`);
        return selection;
    }
}
TaskAssistant.predictSystemPrompt = `You are helping user fill up one or more forms to complete a task. User will first describe task. Then user will provide details on each form, including title, any description and inputs needed. Generate an output JSON with suggested value for inputs. Keys in your output JSON must exactly match the names of the inputs provided. Any date value must be in the format yyyy-mm-dd. If you are not 100% sure about an input, leave it blank.`;
//private static summarizeSystemPrompt = `You are filling a form. Summarize the action in a short sentence or two. Only use the information provided on the form. If any fields are empty, list them as needing information (e.g. Creating purchase order with vendor account X, need info on payment terms.)`;
TaskAssistant.summarizeSystemPrompt = (nextAction) => `Summarize ${nextAction ? "your next data entry action" : "the action taken"} with information provided below in a short sentence or two. Only use the information provided (e.g. Creating purchase order with vendor account "X", Order has been created, Adding an item to the order, All items have been added, etc.)`;
TaskAssistant.choiceSelectionPrompt = `Given the following text, find the best match from the given options. Must select the matching option as-is. If there is no match, return null. If potential matches are too similar, return null.`;

var __decorate = (undefined && undefined.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
class AutomationEngine {
    constructor(script, page, options) {
        this.page = page;
        this.options = options;
        try {
            // Now intiialize the Interpreter
            this.interpreter = new Interpreter(script, this, {
                onEnterHostFunction: async () => {
                    // Every time we enter a host function, we want to flush out any previous queued out
                    await this.flushQueuedOutput();
                },
                onErrorHostFunction: async (fn, error) => {
                    // Error from one of the host functions is fatal
                    // We will route it to the same throw function that we can use from inside DSL
                    await this._fnThrowEx_(error?.message);
                }
            });
            // Append some system function definitions
            this.interpreter.appendCode(`
                function DoWhile(action, condition){
                    var index = 0;
                    do{
                        action(index++);
                    }
                    while(__IsTrue(condition));
                }                    
                function If(condition, action, elseAction){
                    if(__IsTrue(condition))
                        action();
                    else if(elseAction){
                        elseAction();
                    }
                }
                function WaitWhile(condition, options){
                    options = options || {};
                    var interval = Math.max(Math.min(options.interval || 500, 5000), 300);
                    var timeout = Math.max(Math.min(options.interval || 60000, 600000), 1000);
                    var start = Date.now();
                    while(condition()){
                        var waitTime = Date.now() - start;
                        if(waitTime > timeout){
                            __ThrowEx("WaitWhile() operation timed out")
                        }
                        __WaitFor(interval);
                    }
                }
            `);
            if (options?.userMessage) {
                this.taskAssistant = new TaskAssistant();
                this.taskAssistant.addUserMessage(options.userMessage);
            }
        }
        catch (ex) {
            this.error = true;
            warn(`Script loading failed ${ex}\n${ex.stack}`);
        }
    }
    /**
     * Gets the status of the automatino engine
     */
    get status() {
        if (this.error) {
            return AutomationStatus.Failed;
        }
        else if (this.interpreter.status === InterpreterStatus.Ready) {
            return AutomationStatus.Ready;
        }
        else if (this.interpreter.status === InterpreterStatus.Done) {
            return AutomationStatus.Completed;
        }
        else {
            return AutomationStatus.Executing;
        }
    }
    /**
     * Starts the automation engine. This must be called to begin execution of the script.
     */
    async start() {
        const result = await this.execute();
        return result;
    }
    async continue(input) {
        if (this.status !== AutomationStatus.Executing) {
            throw new AutomationError("Automation engine is not in the Executing state");
        }
        if (!input.elements && this.autoResolvedInputs) {
            log(`Applying auto resolved inputs`);
            // We have auto resolved inputs that we can apply since no explicit input was provided
            input.elements = this.autoResolvedInputs;
            this.autoResolvedInputs = null;
        }
        if (this.inputHandler) {
            // We have an input handler, so we can route the input to that
            const handler = this.inputHandler;
            this.inputHandler = null;
            handler.resolve(input);
        }
        else {
            // Handle the inputs using the default handler
            await this.applyInput(input);
        }
        // Now execute remaining part of the script
        return this.execute();
    }
    /**
     * Outputs gets queued and then sent back to the invoker of the automation engine at the end of execution tasks
     * @param output Output to be queued
     */
    async queueOutput(output) {
        // In case we have any previously queued output, flush that before we can queue another output
        await this.flushQueuedOutput();
        this.queuedOutput = output;
    }
    /**
     * If there is any queued output by the automation engine, it will send that to the invoker by yielding current execution flow
     * Awaiting on this allows the caller to continue their task flow when the automation endgine resumes execution
     */
    async flushQueuedOutput() {
        if (this.queuedOutput) {
            log(`Automation engine - flushing queued outputs`);
            // Flushing a queued output means yielding from the interpreter execution so that the engine can return to the caller with the output
            await this.interpreter.yield();
        }
    }
    /**
     * An async native function can wait for more input by yielding from its execution flow.
     * Note: this also flushed any queued output so far
     * @returns Received input
     */
    async waitForInput() {
        // Wait for input requires that we first create an input handler deferred
        if (!this.inputHandler) {
            this.inputHandler = new Deferred();
        }
        // Then we will wait yield and wait for the input to be resolved
        const [input, _] = await Promise.all([this.inputHandler.promise, this.interpreter.yield()]);
        return input;
    }
    /**
     * Handles automatino inputs by applying them to the underling page
     * @param input Inputs to handle
     */
    async applyInput(input) {
        if (input) {
            log(`Executing engine action, inputs: ${input.elements?.length ?? 0}`);
            // Make sure the page is active
            await this.page.bringToFront();
            // Apply any element inputs
            if (input.elements && await applyPageInputs(this.page, input.elements) === false) {
                throw new AutomationError("One or more inputs could not be applied");
            }
        }
    }
    // Executes the program until the end of the current task
    // Task ends when there is an yield operation to flush current output
    async execute() {
        log(`Automation engine - starting sprint`);
        await this.interpreter.execute();
        // Take the current output and send as part of the result
        const output = this.queuedOutput;
        this.queuedOutput = null;
        log(`Automation engine - ending sprint`);
        return { status: this.status, ...await this.applyAutoResolution(output) };
    }
    static async create(script, page, options) {
        // Default script in case none was provided
        script = script ?? "Present()";
        // Compile the script
        const ast = await compileScript(script);
        const engine = new AutomationEngine(ast, page, options);
        this.engines.set(page, engine);
        return engine;
    }
    static get(page) {
        return this.engines.get(page);
    }
    // __ThrowEx function is internal
    // It is used to signal error in the DSL and end the execution of the automation script
    async _fnThrowEx_(errorMessage) {
        this.error = true;
        const formattedMessage = `ERROR - ${errorMessage ?? "We ran into a fatal error"}`;
        warn(formattedMessage);
        this.queueOutput({ message: formattedMessage });
        // This operation has to yield
        // This will allow the caller to know about the error and stop the execution
        await this.interpreter.yield();
    }
    // __WaitForsTrue function is internal
    // It is used to pause execution and wait for a certain amount of time
    async _fnWaitFor_(delay) {
        await waitFor(delay);
    }
    // __IsTrue function is internal
    // It is used to normalize a semantic condition into the boolean 
    async _fnIsTrue_(condition) {
        if (typeof condition === 'string') {
            // This is a NL text (question) which must be resolved via a confirmation prompt
            return await this._fnConfirm_({ label: "Select an option", choices: ["yes", "no"], title: condition }) == "yes";
        }
        else {
            // The truthy value
            return !!condition;
        }
    }
    // Asserts a condition and throws an error if the condition is not satisfied
    async _fnAssert_(condition, errorMessage) {
        if (!condition) {
            await this._fnThrowEx_(errorMessage);
        }
    }
    async _fnExists_(selector) {
        if (await inspectElement(this.page, selector) != null) {
            log(`Element found - ${selector}`);
            return true;
        }
        else {
            log(`Element not found - ${selector}`);
            return false;
        }
    }
    async _fnSelect_(selector) {
        log(`Selecting element - ${selector}`);
        // Make sure the page is active
        await this.page.bringToFront();
        const targetSelector = `::-p-aria(${selector})`;
        if (await withRetries(() => tryClick(this.page, targetSelector), 5, 500)) {
            log(`Selected element - ${selector}`);
        }
        else {
            await this._fnThrowEx_(`Failed to click element - ${selector}`);
        }
    }
    async _fnPresent_(options) {
        const settings = this.currentPresentationSettings = {
            selector: options?.select,
            options: {
                include: options?.include,
                exclude: [options?.exclude, "button"].filter(s => !!s).join(","),
                raw: this.options?.rawContent,
                readonly: this.status == AutomationStatus.Completed
            }
        };
        // Inspect the page and return result
        let { contents, alerts } = await inspectPage(this.page, settings.selector, settings.options);
        if (!contents || contents.length === 0) {
            warn(`No content found for presentation`);
            // Add default root
            contents = [{
                    role: "main",
                    nodeId: 0
                }];
        }
        const rootContent = contents[0];
        const children = rootContent.children = rootContent.children ?? [];
        if (options?.title) {
            // Insert a title node at the very beginning
            children.unshift({
                role: "heading",
                name: options.title,
                level: 1,
                nodeId: 0,
            });
        }
        if (options?.description) {
            // Insert the description following any existing H1 node 
            // or at the begining if none exists
            const h1Index = children.findIndex(c => c.role == "heading" && c.level == 1);
            rootContent.children.splice(h1Index + 1, 0, {
                role: "paragraph",
                name: options.description,
                nodeId: 0,
            });
        }
        if (alerts?.length > 0) {
            // Add alerts to the presentation output, to the very begining
            alerts.forEach(alert => children.unshift(alert));
        }
        await this.queueOutput({ contents, summarize: true });
    }
    async _fnConfirm_(options) {
        const radioGroupNodeId = -1;
        let dynamicNodeId = 1;
        const contentRoot = {
            role: 'generic',
            nodeId: dynamicNodeId++,
            children: [
                options.title ? { role: 'heading', name: options.title, level: 1, nodeId: dynamicNodeId++ } : null,
                options.description ? { role: 'paragraph', name: options.description, nodeId: dynamicNodeId++, } : null,
                {
                    role: 'radiogroup',
                    nodeId: radioGroupNodeId,
                    name: options.label,
                    required: true,
                    children: options.choices.map(choice => {
                        return {
                            role: 'radio',
                            nodeId: dynamicNodeId++,
                            name: choice
                        };
                    })
                }
            ].filter(c => !!c)
        };
        await this.queueOutput({ contents: [contentRoot] });
        const input = await this.waitForInput();
        //log(`Input received ${JSON.stringify(input)}`);
        return input?.elements?.find(e => e.id == `${radioGroupNodeId}`)?.value;
    }
    async __fnNote(message) {
        if (this.taskAssistant) {
            this.taskAssistant.addSystemMessage(message);
        }
    }
    async applyAutoResolution(output) {
        if (this.taskAssistant && output?.contents) {
            let inputsNeeded = false, autoResolutionApplied = false;
            if (this.status === AutomationStatus.Executing) {
                const autoResolution = await this.tryResolveInputs(output.contents);
                if (autoResolution) {
                    this.autoResolvedInputs = autoResolution.resolvedInputs;
                    autoResolutionApplied = autoResolution.resolvedInputs?.length > 0;
                    inputsNeeded = !autoResolution.allResolved;
                    output = { ...output, allInputsResolved: autoResolution.allResolved };
                }
            }
            if (output.summarize && this.options?.generateSummary && !inputsNeeded) {
                // Now include a summay message of the step
                output = { ...output, message: await this.summarize(output.contents, autoResolutionApplied) };
            }
        }
        return output;
    }
    async summarize(nodes, asNextAction) {
        if (nodes?.length > 0) {
            // Find all inputs (only with values)
            const inputNodes = this.findInputs(nodes).filter(node => !isNullOrUndefineOrEmpty(node.value));
            if (inputNodes?.length > 0) {
                // Generate task inputs
                const taskInputs = this.convertToTaskInputs(inputNodes);
                const titleNode = selectNode(nodes[0], "heading[level=1");
                return await this.taskAssistant.summarizeStep({ title: titleNode?.name, inputs: taskInputs }, asNextAction);
            }
        }
    }
    async tryResolveInputs(nodes) {
        if (nodes?.length > 0) {
            // Find all inputs (even with the ones with default values, as we may need to update them)
            const inputNodes = this.findInputs(nodes);
            if (inputNodes?.length > 0) {
                // Generate task inputs
                const taskInputs = this.convertToTaskInputs(inputNodes);
                const titleNode = selectNode(nodes[0], "heading[level=1");
                const predictions = await this.taskAssistant.resolveStepInputs({ title: titleNode?.name, inputs: taskInputs });
                // Apply output values to all input nodes, and build up the resolved input set
                const resolvedInputs = [];
                predictions?.outputs.forEach(output => {
                    const inputNode = inputNodes.find(n => n.nodeId === output.id);
                    if (output.choice) {
                        // We have a selected choice
                        inputNode.value = output.choice.value;
                        resolvedInputs.push({ id: `${inputNode.nodeId}`, value: `${inputNode.value}` });
                    }
                    else if (!isNullOrUndefineOrEmpty(output.value)) {
                        inputNode.value = output.value;
                        resolvedInputs.push({ id: `${inputNode.nodeId}`, value: inputNode.value });
                    }
                });
                return { allResolved: predictions.allResolved, resolvedInputs };
            }
        }
    }
    // Gets all the input nodes
    findInputs(nodes) {
        return nodes
            ?.map(node => selectNodes(node, "combobox,radiogroup,textbox") ?? [])
            .flat()
            .filter(node => !node.readonly && !node.disabled);
    }
    // Convert input nodes to task inputs
    convertToTaskInputs(inputNodes) {
        return inputNodes
            .map(node => {
            switch (node.role?.toLowerCase()) {
                case 'radiogroup':
                case 'combobox':
                    // Children are the options
                    const comboBoxOptions = node.children;
                    if (comboBoxOptions?.length > 0) {
                        return {
                            id: node.nodeId,
                            label: node.name,
                            required: node.required,
                            value: node.value,
                            choices: comboBoxOptions.map(o => ({ labels: o.children?.length > 0 ? o.children.map(child => child.name) : [o.name], value: o.value ?? o.name, id: o.nodeId }))
                        };
                    }
                    return null;
                default:
                    return { id: node.nodeId, label: node.name, required: node.required, value: node.value };
            }
        })
            .filter(n => !!n);
    }
}
AutomationEngine.engines = new WeakMap();
AutomationEngine.NextActionId = -1;
AutomationEngine.BackActionId = -2;
__decorate([
    dslFunction("__ThrowEx")
], AutomationEngine.prototype, "_fnThrowEx_", null);
__decorate([
    dslFunction("__WaitFor")
], AutomationEngine.prototype, "_fnWaitFor_", null);
__decorate([
    dslFunction("__IsTrue")
], AutomationEngine.prototype, "_fnIsTrue_", null);
__decorate([
    dslFunction("Assert")
], AutomationEngine.prototype, "_fnAssert_", null);
__decorate([
    dslFunction("Exists")
], AutomationEngine.prototype, "_fnExists_", null);
__decorate([
    dslFunction("Select")
], AutomationEngine.prototype, "_fnSelect_", null);
__decorate([
    dslFunction("Present")
], AutomationEngine.prototype, "_fnPresent_", null);
__decorate([
    dslFunction("Confirm")
], AutomationEngine.prototype, "_fnConfirm_", null);
__decorate([
    dslFunction("Note")
], AutomationEngine.prototype, "__fnNote", null);
var AutomationStatus;
(function (AutomationStatus) {
    AutomationStatus[AutomationStatus["Ready"] = 0] = "Ready";
    AutomationStatus[AutomationStatus["Executing"] = 1] = "Executing";
    AutomationStatus[AutomationStatus["Completed"] = 2] = "Completed";
    AutomationStatus[AutomationStatus["Failed"] = 3] = "Failed";
})(AutomationStatus || (AutomationStatus = {}));

// Adaptive card builder from accessibility tree nodes
class CardBuilder {
    constructor(rootNode, allowInteraction, executionMode, sessionId, automationResult) {
        this.rootNode = rootNode;
        this.allowInteraction = allowInteraction;
        this.executionMode = executionMode;
        this.sessionId = sessionId;
        this.automationResult = automationResult;
        this.inputIndexToIdMap = [];
        this.elementId = 0;
    }
    /**
     * Generates a card from the given root node
     * @returns
     */
    generateCard() {
        const card = CardBuilder.createCard();
        this.rootNode?.children
            ?.map(node => this.convertToAdaptiveElement(node, /*radonly:*/ !this.allowInteraction))
            .filter(n => n != null)
            .forEach(node => card.body.push(node));
        if (this.allowInteraction) {
            var actions = this.generateCardActions(this.rootNode?.children, /*maxCount:*/ 2);
            if (actions != null && actions.length > 0) {
                card.body.push({
                    type: "ActionSet",
                    spacing: "padding",
                    actions: actions
                });
            }
            else if (this.allowInteraction) {
                // Generate the default actions
                card.body.push({
                    type: "ActionSet",
                    actions: this.generateDefaultCardActions(),
                    spacing: "padding"
                });
            }
            // If we do not have all auto-resolved inputs in the autonomous mode, add an alert
            if (this.automationResult.allInputsResolved == false) {
                card.body.unshift(this.generateAlert("⚠ Please fill in missing information to continue"));
            }
        }
        return card;
    }
    /**
     * Generates a placeholder card with the given message or a default
     * @param message
     * @returns
     */
    static generateEmptyPlaceholderCard(message) {
        const card = this.createCard();
        card.body.push({
            type: "Image",
            url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='currentColor' class='bi bi-exclamation' viewBox='0 0 16 16'%3E%3Cpath d='M7.002 11a1 1 0 1 1 2 0 1 1 0 0 1-2 0M7.1 4.995a.905.905 0 1 1 1.8 0l-.35 3.507a.553.553 0 0 1-1.1 0z'/%3E%3C/svg%3E",
            width: "100px",
            horizontalAlignment: "center",
        });
        card.body.push({
            type: "TextBlock",
            text: message ?? "Nothing to show",
            size: "medium",
            wrap: true,
            horizontalAlignment: "center",
        });
        return card;
    }
    static createCard() {
        return {
            type: "AdaptiveCard",
            version: CardBuilder.SchemaVersion,
            body: []
        };
    }
    convertToAdaptiveElement(node, readOnly) {
        switch (node.role?.toLowerCase()) {
            case "combobox":
                return (node.readonly == true || readOnly) ?
                    (isNullOrEmpty(node.value) ? null : {
                        type: "FactSet",
                        id: this.newElementId(),
                        facts: [
                            { type: "Fact", title: node.name, value: toString(node.value) }
                        ]
                    }) :
                    (any(node.children) != true && isNullOrEmpty(node?.value) ?
                        // Combo-box without values will be converted to plain text input
                        this.convertTextInput(node, readOnly) :
                        {
                            type: "Input.ChoiceSet",
                            id: this.getInputElementId(node),
                            style: 'compact',
                            value: toString(node.value),
                            label: node.name,
                            isRequired: node.required ?? false,
                            errorMessage: (node.required ?? false) ? `${node.name} is required` : null,
                            choices: node.children?.map(n => ({ type: "Input.Choice", title: n.name, value: toString(n.value, n.name) })) ??
                                (!isNullOrEmpty(node.value) ? [{ type: "Input.Choice", title: toString(node.value), value: toString(node.value) }] : [])
                            //Data = new AdaptiveDataQuery
                            //{
                            //    DataSet = $"combobox-{node.NodeId}"
                            //}
                        });
            case "radiogroup":
                return (node.readonly == true || readOnly || any(node.children?.filter(c => c.role?.toLowerCase() == "radio")) != true) ?
                    null :
                    {
                        type: "Input.ChoiceSet",
                        id: this.getInputElementId(node),
                        style: 'expanded',
                        value: toString(node.value),
                        label: node.name,
                        isRequired: node.required ?? false,
                        errorMessage: (node.required ?? false) ? `${node.name} is required` : null,
                        choices: node.children
                            ?.filter(c => c.role?.toLowerCase() == "radio")
                            .map(n => ({ type: "Input.Choice", title: n.name, value: toString(n.value, n.name) })) ??
                            (!isNullOrEmpty(node.value) ? [{ type: "Input.Choice", title: toString(node.value), value: toString(node.value) }] : [])
                    };
            case "textbox":
                return this.convertTextInput(node, readOnly);
            case "link":
                return (isNullOrEmpty(node.value) ? null :
                    {
                        type: "FactSet",
                        id: this.newElementId(),
                        facts: [
                            { type: "Fact", title: node.name, value: toString(node.value) }
                        ]
                    });
            case "alert":
                return this.generateAlert(node.name);
            case "heading":
                return {
                    type: "TextBlock",
                    id: this.newElementId(),
                    text: node.name,
                    size: this.mapHeadingLevelToSize(node),
                    style: 'heading',
                    wrap: true
                };
            case "labeltext":
            case "paragraph":
            case "statictext":
                return {
                    type: "TextBlock",
                    id: this.newElementId(),
                    text: node.name,
                    style: 'paragraph',
                    wrap: true,
                };
            // Handle generic containers
            case "grid":
            case "row":
            case "gridcell":
            case "region":
            case "form":
            case "group":
                return this.handleContainer(node, readOnly);
        }
        return null;
    }
    generateAlert(message) {
        return {
            type: "TextBlock",
            id: this.newElementId(),
            text: message,
            color: "attention",
            wrap: true
        };
    }
    convertTextInput(node, readOnly) {
        if (node.readonly == true || readOnly) {
            return (isNullOrEmpty(node.value) ? null : {
                type: "FactSet",
                id: this.newElementId(),
                facts: [
                    { type: "Fact", title: node.name, value: toString(node.value) }
                ]
            });
        }
        else {
            switch (node.inputType) {
                case "date":
                    return this.createAdaptiveInput(node, {
                        type: "Input.Date",
                        value: tryParseDate(toString(node.value)),
                    });
                case "time":
                    return this.createAdaptiveInput(node, {
                        type: "Input.Time",
                        value: toString(node.value)
                    });
                default:
                    return this.createAdaptiveInput(node, {
                        type: "Input.Text",
                        value: toString(node.value)
                    });
            }
        }
    }
    createAdaptiveInput(node, props) {
        return {
            ...props,
            id: this.getInputElementId(node),
            label: node.name,
            isRequired: node.required ?? false,
            errorMessage: (node.required ?? false) ? `${node.name} is required` : null,
        };
    }
    handleContainer(node, readOnly) {
        const children = node.children?.map(n => this.convertToAdaptiveElement(n, readOnly)).filter(n => n != null);
        // Children must have something other than headings
        if (any(children, n => n.type !== "TextBlock" || n.style !== "heading") == true) {
            // Only add non-empty containers
            return {
                type: "Container",
                id: this.newElementId(),
                items: children,
            };
        }
        return null;
    }
    getInputElementId(node) {
        const index = this.inputIndexToIdMap.length;
        this.inputIndexToIdMap.push(toString(node.nodeId));
        return `Inputs_${index}`;
    }
    newElementId() {
        return `el-${++this.elementId}`;
    }
    generateDefaultCardActions() {
        return [
            {
                type: "Action.Submit",
                id: uuid.v4(),
                title: "Next",
                style: "positive",
                data: {
                    sessionId: this.sessionId,
                    executionMode: this.executionMode,
                    inputIndexToIdMap: this.inputIndexToIdMap
                }
            }
        ];
    }
    generateCardActions(nodes, maxCount) {
        return nodes?.filter(n => n.role == "button")
            .filter(n => n.constrastRatio > 0)
            .sort((a, b) => a.constrastRatio - b.constrastRatio)
            .slice(0, maxCount)
            .map(n => ({
            type: "Action.Submit",
            id: n.nodeId,
            title: n.name,
            style: n.constrastRatio > 10 ? "positive" : "default",
            data: {
                sessionId: this.sessionId,
                executionMode: this.executionMode,
                targetId: toString(n.nodeId),
                inputIndexToIdMap: this.inputIndexToIdMap
            }
        }));
    }
    mapHeadingLevelToSize(node) {
        switch (node.level) {
            case 1: return "extraLarge";
            case 2: return "large";
            case 3: return "medium";
            default:
                return "small";
        }
    }
    /**
     * Adaptive card sends input values flattended in the request object keyed by their IDs
     * We generate input ids in the format "Input_0", "Input_1" ...
     * Second part of the name is the index, which can be used to lookup the backend ID
     * @param request
     */
    static parseCardInputs(request) {
        if (request.inputIndexToIdMap?.length > 0) {
            const inputs = [];
            // Use the index to resolve IDs
            Object.keys(request).forEach(propName => {
                if (propName.startsWith("Inputs_")) {
                    const parts = propName.split('_');
                    let index;
                    if (parts.length == 2 && !isNaN(index = parseInt(parts[1]))) {
                        if (request.inputIndexToIdMap.length > index) {
                            const inputId = request.inputIndexToIdMap[index];
                            const value = request[propName];
                            // If there is an existing entry for this input, update it
                            const existing = inputs.find(e => e.id == inputId);
                            if (existing) {
                                existing.value = value;
                            }
                            else {
                                inputs.push({ id: inputId, value });
                            }
                        }
                    }
                }
            });
            return inputs;
        }
    }
}
CardBuilder.SchemaVersion = "1.4";
var ExecutionMode;
(function (ExecutionMode) {
    ExecutionMode[ExecutionMode["Manual"] = 0] = "Manual";
    ExecutionMode[ExecutionMode["Autonomous"] = 1] = "Autonomous";
})(ExecutionMode || (ExecutionMode = {}));
function isNullOrEmpty(value) {
    if (value === null || value === undefined) {
        return true;
    }
    if (typeof value === 'string') {
        return !value;
    }
    return false;
}
function any(collection, filterBy) {
    if (filterBy) {
        collection = collection.filter(filterBy);
    }
    return collection?.length > 0;
}
function toString(value, defaultValue) {
    return value === undefined ? (defaultValue ?? '') : `${value}`;
}
function tryParseDate(value) {
    const epoch = Date.parse(value);
    if (isNaN(epoch)) {
        return null;
    }
    else {
        const date = new Date(epoch);
        // Adaptive cards need date in this specific format
        return `${date.getFullYear()}-${date.getMonth}-${date.getDate()}`;
    }
}

var AutomationService;
(function (AutomationService) {
    /**
     * Starts an automation flow
     * @param request
     * @returns
     */
    async function startAutomation(request) {
        return withErrorHandling(async () => {
            const navigationResult = await _startNavigation(request);
            return _toAutomationResult(navigationResult.sessionId, request.executionMode, navigationResult);
        });
    }
    AutomationService.startAutomation = startAutomation;
    /**
     * Continues an automation flow
     * @param request
     * @returns
     */
    async function continueAutomation(request) {
        return withErrorHandling(async () => {
            const executionResult = await _executeAction({
                sessionId: request.sessionId,
                targetId: request.targetId,
                inputs: CardBuilder.parseCardInputs(request)
            });
            return _toAutomationResult(request.sessionId, request.executionMode, executionResult);
        });
    }
    AutomationService.continueAutomation = continueAutomation;
    /**
     * Closes an existing automation session
     * @param request
     * @returns
     */
    async function closeSession(request) {
        return _closeSession(request.SessionId);
    }
    AutomationService.closeSession = closeSession;
    /**
     * Wraps card-bound actions with high-level error handling
     * @param action
     * @returns
     */
    async function withErrorHandling(action) {
        try {
            return (await action());
        }
        catch (error) {
            warn(`${error}`);
            let errorResult;
            if (error instanceof puppeteer.TimeoutError) {
                errorResult = { status: AutomationStatus.Failed, error: "Operation timed out, please try again" };
            }
            else if (error instanceof AutomationError) {
                errorResult = { status: AutomationStatus.Failed, error: error.message };
            }
            else {
                errorResult = { status: AutomationStatus.Failed, error: "Oops! We ran into an error" };
            }
            return _toAutomationResult(null, null, errorResult);
        }
    }
    /**
     * Closes a page session and ends associated automation
     * @param request
     */
    async function _closeSession(sessionId) {
        if (sessionId) {
            await closePageSession(sessionId);
            log(`Session ${sessionId} closed`);
        }
    }
    /**
     * Peforms the initial navigation in an automation script
     */
    async function _startNavigation(request) {
        const { enableLiveView } = request;
        // If we are in the "manual" login mode, close out all existing sessions for this user first
        // A user is only allowed one active session at a time, untless we are reusing an existing session
        const singleSession = config.loginMode === "manual";
        const beginRequest = async () => {
            const { url, path, sessionId } = request;
            if (singleSession) {
                const activeSessions = getActiveUserSessions();
                for (const activeSessionId of activeSessions) {
                    if (sessionId != activeSessionId) {
                        await closePageSession(activeSessionId);
                    }
                }
            }
            if (sessionId) {
                if (url) {
                    warn(`*** Ignoring URL parameter as a session ID ${sessionId} is also specified`);
                }
                const page = getPageSession(sessionId);
                if (!page) {
                    warn(`Page not found for the given session id: ${sessionId}`);
                    return { page, status: NavigationStatus.Failed, sessionId: null, error: `Session not found`, appUrl: null };
                }
                else {
                    log(`Using the page from an existing session ${sessionId}`);
                    return { page, status: NavigationStatus.Success, sessionId, error: null, appUrl: null };
                }
            }
            else if (url) {
                // TODO: Validate that the URL is allowed by the whitelist
                // TODO: Allow URLs to be specified with placeholder origin so that we can resolve them here (e.g. {dyn_fno} or {dyn_crm} or {pa})
                // Open a new page in a new session
                log(`Starting a new session`);
                return await navigatePage(url, asString(path), enableLiveView);
            }
            else {
                warn(`Invalid request: ${JSON.stringify(request)}`);
                return { page: null, status: NavigationStatus.Failed, sessionId: null, error: `Invalid request`, appUrl: null };
            }
        };
        const { status, sessionId, page, error, appUrl } = await beginRequest();
        if (status !== NavigationStatus.Success) {
            warn(`Navigation failed ${status}`);
            return { status: AutomationStatus.Failed, error: error ?? "Navigation failed" };
        }
        const { script, raw, userMessage, generateSummary } = request;
        let result;
        if (script) {
            log(`Running script`);
            // We will use the script engine
            const scriptEngine = await AutomationEngine.create(script, page, { rawContent: raw == true, userMessage, generateSummary });
            result = await scriptEngine.start();
        }
        else {
            log(`Inspecting page`);
            // Use default page inspection
            const { contents } = await inspectPage(page, null, { raw: raw == true });
            result = { contents, status: AutomationStatus.Executing };
        }
        log(`/navigate operation complete, session id: ${sessionId}`);
        // // Before returning, trigger a pre-loading
        if (!singleSession && appUrl && !enableLiveView) {
            preloadPage(appUrl);
        }
        return { sessionId, ...result };
    }
    /**
     * Executes next automation step
     * @param request
     */
    async function _executeAction(request) {
        // Get page from the session cache
        const page = getPageSession(request.sessionId);
        if (!page) {
            // Page not found
            throw new AutomationError(`Session not found - ${request.sessionId ?? ''}`);
        }
        else {
            log(`Found page ${request.sessionId}, dispatching action`);
            let actionResult;
            // Does this page have an automation engine attached?
            const engine = AutomationEngine.get(page);
            if (engine) {
                // Dispatch the action through the engine
                actionResult = await engine.continue({ elements: request.inputs });
            }
            else {
                // Directly dispatch the action to the page
                const { status } = await executeAction(page, `${request.targetId}`, request.inputs);
                // Obtain states of the current request
                log(`Inspecting page current state`);
                const { contents } = await inspectPage(page);
                log(`Page inspection complete`);
                actionResult = { status: status == ActionStatus.Success ? AutomationStatus.Executing : AutomationStatus.Failed, contents };
            }
            log(`*** Action executed ***`);
            return actionResult;
        }
    }
    function _toAutomationResult(sessionId, executionMode, automationResult) {
        var rootNode = automationResult?.contents?.[0];
        // Did we get any content?
        var hasContent = rootNode != null && rootNode.children?.length > 0;
        var automationStatus = automationResult?.status ?? AutomationStatus.Failed;
        // If automation is no longer executing, close the current session
        // 7/3/2024 - Reverting chaining to allow better concurrency and avoid exhaustion of browser pool
        if (automationStatus != AutomationStatus.Executing) {
            // Fire and forget, no need to wait for the session to actually close
            _closeSession(sessionId);
            sessionId = null;
        }
        if (hasContent) {
            // Should the card allow further interaction?
            // This is only allowed if automation is still executing and we got the expected content
            var allowInteraction = (automationStatus == AutomationStatus.Executing);
            var cardBuilder = new CardBuilder(rootNode, allowInteraction, executionMode, sessionId, automationResult);
            var card = cardBuilder.generateCard();
            return {
                status: AutomationStatus[automationStatus],
                cardJSON: JSON.stringify(card),
                sessionId: sessionId,
                autoContinuationRequest: executionMode == ExecutionMode.Autonomous &&
                    automationResult?.allInputsResolved == true &&
                    automationResult.status == AutomationStatus.Executing ?
                    { executionMode: executionMode, sessionId: sessionId, targetId: undefined, inputIndexToIdMap: undefined } :
                    null,
                message: automationResult?.message,
            };
        }
        else {
            return {
                status: AutomationStatus[AutomationStatus.Completed],
                cardJSON: JSON.stringify(CardBuilder.generateEmptyPlaceholderCard(automationResult.error)),
            };
        }
    }
    (function (Legacy) {
        /**
         * @param request
         * @returns
         */
        async function navigate(request) {
            const navigationResult = await _startNavigation({
                url: request.Url,
                path: request.Path,
                sessionId: request.SessionId,
                enableLiveView: request.EnableLiveView,
                script: request.Script,
                userMessage: request.UserMessage,
                generateSummary: request.GenerateSummary,
                raw: false
            });
            return toAutomationResult(navigationResult.sessionId, navigationResult);
        }
        Legacy.navigate = navigate;
        /**
         * @param request
         * @returns
         */
        async function execute(request) {
            const executionResult = await _executeAction({
                sessionId: request.SessionId,
                targetId: request.TargetId,
                inputs: request.Inputs?.map(e => ({ value: e.Value, id: e.Id }))
            });
            return toAutomationResult(request.SessionId, executionResult);
        }
        Legacy.execute = execute;
        /**
         * Inspects the current page in an existing session
         * @param request
         * @returns
         */
        async function inspect(request) {
            const { sessionId } = request;
            if (typeof sessionId == 'string' && sessionId) {
                // Get page from the session cache
                const page = getPageSession(sessionId);
                if (!page) {
                    // Page not found
                    throw new AutomationError(`Session not found - ${sessionId ?? ''}`);
                }
                else {
                    log(`${sessionId} - found page, inspecting`);
                    const states = await inspectPage(page);
                    log(`*** Page inspection complete ***`);
                    return { sessionId, ...states };
                }
            }
        }
        Legacy.inspect = inspect;
        /**
         * @param request
         * @returns
         */
        async function close(request) {
            return _closeSession(request.sessionId);
        }
        Legacy.close = close;
        function toAutomationResult(sessionId, result) {
            return { SessionId: sessionId, Status: result.status, Contents: result.contents, Message: result.message, Error: result.error };
        }
    })(AutomationService.Legacy || (AutomationService.Legacy = {}));
})(AutomationService || (AutomationService = {}));

// This file is a port from the node_modules/hyco-https/index.js
// It doesn't modify the base https module as the packged file does
// Instead it allows creation of indepent relayed server
// It also adds some basic typescript typing
/**
 * Create a new HybridConnectionsHttpsServer.
 *
 * @param {Object} options Server options
 * @param {Function} fn Optional connection listener.
 * @returns {https.RelayedServer}
 * @api public
 */
function createRelayedServer(options, fn) {
    var server = new relay__namespace.Server(options, fn);
    return server;
}
/**
 * Create a Relay Token
 *
 * @param {String} uri The URL/address to connect to.
 * @param {String} keyName The SharedAccessSignature key name.
 * @param {String} key The SharedAccessSignature key value.
 * @param {number} expirationSeconds Optional number of seconds until the generated token should expire.  Default is 1 hour (3600) if not specified.
 * @api public
 */
function createRelayToken(uri, keyName, key, expirationSeconds) {
    var parsedUrl = url.parse(uri);
    parsedUrl.protocol = 'http';
    parsedUrl.search = parsedUrl.hash = parsedUrl.port = null;
    parsedUrl.pathname = parsedUrl.pathname.replace('$hc/', '');
    uri = url.format(parsedUrl);
    if (!expirationSeconds) {
        // Token expires in one hour (3600 seconds)
        expirationSeconds = 3600;
    }
    var unixSeconds = moment().add(expirationSeconds, 'seconds').unix();
    var string_to_sign = encodeURIComponent(uri) + '\n' + unixSeconds;
    var hmac = crypto.createHmac('sha256', key);
    hmac.update(string_to_sign);
    var signature = hmac.digest('base64');
    var token = 'SharedAccessSignature sr=' + encodeURIComponent(uri) + '&sig=' + encodeURIComponent(signature) + '&se=' + unixSeconds + '&skn=' + keyName;
    return token;
}
/**
 * Create a Uri for using with Relay Hybrid Connections
 *
 * @param {String} serviceBusNamespace The ServiceBus namespace, e.g. 'contoso.servicebus.windows.net'.
 * @param {String} path The endpoint path.
 * @api public
 */
function createRelayBaseUri(serviceBusNamespace, path) {
    return 'wss://' + serviceBusNamespace + ':443/$hc/' + path;
}
/**
 * Create a Uri for requesting from a Relay Hybrid Connection endpoint
 *
 * @param {String} serviceBusNamespace The ServiceBus namespace, e.g. 'contoso.servicebus.windows.net'.
 * @param {String} path The endpoint path.
 * @param {String} token Optional SharedAccessSignature token for authenticating the sender.
 * @param {String} id Optional A Guid string for end to end correlation.
 * @api public
 */
function createRelayHttpsUri(serviceBusNamespace, path, token, id) {
    var uri = 'https://' + serviceBusNamespace + '/' + path;
    if (token != null) {
        uri = uri + (uri.indexOf('?') == -1 ? '?' : '&') + 'sb-hc-token=' + encodeURIComponent(token);
    }
    if (id != null) {
        uri = uri + (uri.indexOf('?') == -1 ? '?' : '&') + 'sb-hc-id=' + encodeURIComponent(id);
    }
    return uri;
}
/**
 * Create a Uri for listening on a Relay Hybrid Connection endpoint
 *
 * @param {String} serviceBusNamespace The ServiceBus namespace, e.g. 'contoso.servicebus.windows.net'.
 * @param {String} path The endpoint path.
 * @param {String} token Optional SharedAccessSignature token for authenticating the listener.
 * @param {String} id Optional A Guid string for end to end correlation.
 * @api public
 */
function createRelayListenUri(serviceBusNamespace, path, token, id) {
    var uri = createRelayBaseUri(serviceBusNamespace, path);
    uri = uri + (uri.indexOf('?') == -1 ? '?' : '&') + 'sb-hc-action=listen';
    if (token != null) {
        uri = uri + '&sb-hc-token=' + encodeURIComponent(token);
    }
    if (id != null) {
        uri = uri + '&sb-hc-id=' + encodeURIComponent(id);
    }
    return uri;
}

/**
 * Sets the connection string to the azure relay to use
 * Connection string information is persisted in the env.config.js file
 * SAS key must have Send and Listen rights
 * @param connectionString
 */
async function setConnectionString(connectionString) {
    const relayProps = serviceBus.parseServiceBusConnectionString(connectionString);
    if (relayProps) {
        if (!relayProps.entityPath) {
            throw new Error(`Connection string is missing the hybrid connection entity path`);
        }
        updateConfig({
            relay: relayProps
        });
        // Reinitialize the relay server
        await initializeRelayServer();
    }
}
let relayServer;
async function initializeRelayServer() {
    if (config.relay) {
        const { fullyQualifiedNamespace: ns, entityPath: path, sharedAccessKeyName: keyrule, sharedAccessKey: key } = config.relay;
        if (relayServer) {
            await new Promise(resolve => relayServer.close(() => resolve()));
        }
        relayServer = createRelayedServer({
            server: createRelayListenUri(ns, path),
            token: createRelayConnectionToken(config.relay)
        }, (req, res) => {
            const badRequest = () => {
                log('Relay bad request: ' + req.method + ' on ' + req.url);
                res.statusCode = 400;
                res.end();
            };
            if (req.method != 'POST') {
                return badRequest();
            }
            // Resolve handler
            const handler = getRequestHandler(req.url);
            if (!handler) {
                return badRequest();
            }
            log('Relay request accepted: ' + req.method + ' on ' + req.url);
            // Read request body, which is a stream
            let body = '';
            req.on('data', (chunk) => {
                body += chunk;
            });
            req.on('end', async () => {
                //log(`full request: ${body}`)
                // Now invoke the handler
                try {
                    const response = await handler(JSON.parse(body));
                    if (response) {
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify(response));
                    }
                }
                catch (error) {
                    warn(`Relay request execution error ${error}`);
                    // Any error is returned as 500
                    res.statusCode = 500;
                    res.end(`Error: ${error}`);
                }
            });
        });
        relayServer.listen();
        log('Relay listening');
        relayServer.on('error', (err) => {
            warn('Relay error' + err);
        });
        return true;
    }
    return false;
}
function getRequestHandler(path) {
    if (path.endsWith('/api/automation/start')) {
        return (req) => AutomationService.startAutomation(req);
    }
    else if (path.endsWith('/api/automation/continue')) {
        return (req) => AutomationService.continueAutomation(req);
    }
    else if (path.endsWith('/api/automation/stop')) {
        return (req) => AutomationService.closeSession(req);
    }
}
function createRelayConnectionToken(config, expirationSeconds) {
    // For the token, the URL is normalized to be http
    return createRelayToken(`http://${config.fullyQualifiedNamespace}/${config.entityPath}`, config.sharedAccessKeyName, config.sharedAccessKey, expirationSeconds);
}
function getRelaySenderSettings() {
    if (config.relay) {
        const senderToken = createRelayConnectionToken(config.relay, 60 * 60 * 24 * 90); // token valid for 90 days
        var senderUri = createRelayHttpsUri(config.relay.fullyQualifiedNamespace, config.relay.entityPath);
        return {
            url: senderUri,
            token: senderToken
        };
    }
}

function getSettings() {
    return {
        // Only indicate which key has been provided
        relayConnectionString: config.relay?.sharedAccessKeyName ? `SharedAccessKeyName=${config.relay?.sharedAccessKeyName} ●●●●●●●●●●●●●●●●●` : "",
        clientConnection: getRelaySenderSettings(),
        azureOpenaiEndpoint: config.azureOpenai?.endpoint,
        azureOpenaiKey: config.azureOpenai?.key ? keyMask : undefined,
        incomplete: checkSettingsIncomplete()
    };
}
// Checks settings to make sure all required configurations have been done
function checkSettingsIncomplete() {
    return !config.relay || !config.azureOpenai;
}
async function saveSettings(settings) {
    log(`Saving settings ${JSON.stringify(settings)}`);
    const result = {};
    if (settings.relayConnectionString) {
        // Save the connection string
        try {
            await setConnectionString(settings.relayConnectionString);
            result.relayConnectionString = {
                saved: true,
            };
        }
        catch (error) {
            result.relayConnectionString = {
                saved: false,
                error: error.message
            };
        }
    }
    if (settings.azureOpenaiEndpoint && settings.azureOpenaiKey && settings.azureOpenaiKey !== keyMask) {
        await updateConfig({
            azureOpenai: {
                endpoint: settings.azureOpenaiEndpoint,
                key: settings.azureOpenaiKey
            }
        });
        intializeOpenAiClient();
    }
    return result;
}
const keyMask = "--------------";

const app = express();
const httpServer = http.createServer(app);
app.use(express.json());
// Register all the views available
registerViewRoutes(app);
// Initialize the hub
MonitorHub.initialize(httpServer);
app.post('/api/automation/start', processRequest(async (req, res) => {
    log(`Handling /api/automation/start ...`);
    res.status(200).send(await AutomationService.startAutomation(req.body));
}));
app.post('/api/automation/continue', processRequest(async (req, res) => {
    log(`Handling /api/automation/continue ...`);
    res.status(200).send(await AutomationService.continueAutomation(req.body));
}));
app.post('/api/automation/stop', processRequest(async (req, res) => {
    log(`Handling /api/automation/stop ...`);
    res.status(200).send(await AutomationService.closeSession(req.body));
}));
app.get('/api/settings', processRequest(async (req, res) => {
    log(`Handling GET /api/settings ...`);
    res.status(200).send(getSettings());
}));
app.post('/api/settings', processRequest(async (req, res) => {
    log(`Handling POST /api/settings ...`);
    res.status(200).send(await saveSettings(req.body));
}));
/**
 * @deprecated This request is not used by the nodejs server direct client
 */
app.post('/navigate', processRequest(async (req, res) => {
    log(`Handling /navigate ...`);
    res.status(200).send(await AutomationService.Legacy.navigate(req.body));
}));
/**
 * @deprecated This request is not used by the nodejs server direct client
 */
app.get('/inspect', processRequest(async (req, res) => {
    log(`Handling /inspect ...`);
    res.status(200).send(await AutomationService.Legacy.inspect({ sessionId: asString(req.query.sessionId) }));
}));
/**
 * @deprecated This request is not used by the nodejs server direct client
 */
app.post('/execute', processRequest(async (req, res) => {
    log(`Handling /execute ...`);
    res.status(200).send(await AutomationService.Legacy.execute(req.body));
}));
/**
 * @deprecated This request is not used by the nodejs server direct client
 */
app.post('/close', processRequest(async (req, res) => {
    log(`Handling /close ...`);
    await AutomationService.Legacy.close(req.body);
    res.status(200).send();
}));
// Serve the static DSL type definition file
app.use("/lib/dsl.lib.d.ts", express.static(__dirname + '/dsl.lib.d.ts'));
const port = 7000;
httpServer.listen(port, function () {
    log(`Running on port 7000.`);
});
// Processes request with error handling
function processRequest(operation) {
    return asyncHandler((req, res) => {
        const monitorCallbackUrl = req.header(MonitorCallbackUrlHeaderName);
        //log(`Monitor callback url: ${monitorCallbackUrl}`)
        // DO we have a monitor token in the request?
        withTraceContext({
            monitorSession: req.header(MonitorSessionHeaderName),
            remoteToken: req.header(MonitorTokenHeaderName),
            remoteCallbackUrl: monitorCallbackUrl
        }, async () => {
            try {
                await startup;
                await operation(req, res);
            }
            catch (error) {
                warn(`${error}`);
                if (error instanceof puppeteer.TimeoutError) {
                    res.status(200).send({ status: ActionStatus.Failed, error: "Operation timed out, please try again" });
                }
                else if (error instanceof AutomationError) {
                    res.status(200).send({ status: ActionStatus.Failed, error: error.message });
                }
                else {
                    res.status(400).send();
                }
            }
        });
    });
}
const startup = start();
async function start() {
    // Handle login on startup
    await bootstrapLogin();
    // Initialize relay server
    await initializeRelayServer();
    if (checkSettingsIncomplete()) {
        const open = await import('open');
        open.default(`http://localhost:${port}/settings`);
    }
}
