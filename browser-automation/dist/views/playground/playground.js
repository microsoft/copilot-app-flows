(() => {
    const storageKey = "playground-card-defaults";
    const userPrefStorageKey = "playground-user-prefs";
    const $cardDetailsForm = document.querySelector("#card-details")
    const $cardArea = document.querySelector("#card-area")
    const $cardLoading = document.querySelector("#card-loading")
    const $cardUrl = document.querySelector("#card-url") // could be null when the page is loaded in a chained session
    const $cardPath = document.querySelector("#card-path")
    const $cardScript = document.querySelector("#card-script")
    const $cardModeSelector = document.querySelector("#card-mode-selector")
    const $cardContainer = document.querySelector("#card-container")
    const $messageContainer = document.querySelector("#message-container")
    const $chainCardBtn = document.querySelector("#chain-card")
    const $playgrounContainer = document.querySelector("#playground-container");
    const $executeManualBtn = document.querySelector("#execute-manual");
    const $executeAutoBtn = document.querySelector("#execute-autonomous");
    const $userMessage = document.querySelector("#user-message");
    const $terminalPanel = document.getElementById('terminalpanel');
    const $liveViewImage = document.getElementById("liveview-img");
    const $liveViewReplayModal = document.getElementById("videoReplayModal");
    const $outputContainer = document.getElementById("output-container");

    let sessionId = window.CardSessionId;
    const isChained = !!sessionId;
    let isLoading = false;
    let liveViewEnabled = true;

    // If a session ID is provided, it is a chaining scenario and we do not accept the URL as an input
    showHideCardInput($cardUrl, !!sessionId);

    $cardModeSelector.addEventListener("change", onCardModeChange);
    onCardModeChange();

    if (!sessionId) {
        applyPlaygroundDefaults();
    }
    hideLoadingIndicator();
    $playgrounContainer.classList.remove("d-none");

    $executeAutoBtn.addEventListener("click", (e) => {
        //e.stopPropagation();
        e.preventDefault();
        startAutomation(true);
    })

    $executeManualBtn.addEventListener("click", (e) => {
        //e.stopPropagation();
        e.preventDefault();
        startAutomation(false);
    })

    const startAutomation = async (isAutonomous) => {
        if (isLoading) {
            // Already running
            return;
        }

        try {
            $outputContainer.classList.remove("show-placeholder");
            showLoadingIndicator();
            $cardContainer.replaceChildren();
            $messageContainer.replaceChildren();
            scrollOutputIntoView();

            // Save settings
            savePlaygroundDefaults();

            if (sessionId && !isChained) {
                // We still have an existing active session that we need to close
                await sendRequest(`/api/automation/stop`, { SessionId: sessionId });
                sessionId = null;
                // End any ongoing live-view
                await monitor?.endLiveView();
            }

            // Start live-view, if needed
            if (liveViewEnabled) {
                await monitor.startLiveView();
            }

            const response = await sendRequest(`/api/automation/start`, {
                url: isChained ? null : $cardUrl?.value,
                sessionId: isChained ? sessionId : null,
                path: $cardModeSelector.value == "1" ? $cardPath.value : null,
                script: $cardModeSelector.value == "0" ? $cardScript.value : null,
                mode: $cardModeSelector.value,
                userMessage: $userMessage.value,
                executionMode: isAutonomous ? 1 : 0,
                generateSummary: isAutonomous,
                enableLiveView: liveViewEnabled
            });
            if (response.ok) {
                const cardResult = await response.json();
                sessionId = cardResult.sessionId;
                const status = cardResult.status;

                scrollOutputIntoView();
                hideLoadingIndicator();

                if (sessionId && status == "Completed") {
                    //$chainCardBtn.classList.remove("d-none");
                }
                else {
                    $chainCardBtn.classList.add("d-none");
                }
                await emitMessage(cardResult.message);
                const continuationToken = cardResult.autoContinuationRequest;
                if (continuationToken) {
                    // Auto continue the request to next phase
                    await executeCardAction(continuationToken);
                }
                else {
                    // Render the card
                    await renderAdaptiveCard(cardResult.cardJSON);
                    if (status != "Executing") {
                        // No longer executing in the session, end live-view
                        await monitor?.endLiveView();
                    }
                }
            }
            else {
                await emitMessage("An error occurred. Please try again.")
                // End any ongoing live-view
                await monitor?.endLiveView();
            }
        }
        finally {
            hideLoadingIndicator();
        }
    };

    $chainCardBtn.addEventListener("click", () => {
        window.location.search = `sessionid=${sessionId}`;
    })

    function hideLoadingIndicator() {
        isLoading = false;
        $cardLoading.classList.add("d-none");
    }

    function showLoadingIndicator() {
        isLoading = true;
        $cardLoading.classList.remove("d-none");
    }

    function onCardModeChange() {
        const value = $cardModeSelector.value;
        showHideCardInput($cardScript, value != "0")
        showHideCardInput($cardPath, value != "1")
    }

    function emitMessage(message) {
        if (!message) return;
        return new Promise((resolve) => {
            const $messageElement = document.createElement('p');
            $messageContainer.append($messageElement);
            // As we type into the message, it's size grows
            // Make sure to make it visible by scrolling it into the view
            const messageObserver = new ResizeObserver(() => {
                scrollElementIntoView($messageElement)
            })
            messageObserver.observe($messageElement);
            const messageTypeWriter = new Typewriter($messageElement, {
                delay: 10,
            })
            messageTypeWriter.typeString(message);
            messageTypeWriter.callFunction((state) => {
                // hide cursor
                state.elements.cursor.style.display = 'none';                
                resolve();
                messageObserver.unobserve($messageElement);
            });
            messageTypeWriter.start();
        })
    }

    async function renderAdaptiveCard(cardJSON) {
        var cardDefinition = JSON.parse(cardJSON);
        // Create an AdaptiveCard instance
        var adaptiveCard = new AdaptiveCards.AdaptiveCard();

        // Set its hostConfig property unless you want to use the default Host Config
        // Host Config defines the style and behavior of a card
        adaptiveCard.hostConfig = new AdaptiveCards.HostConfig({
            fontFamily: "Segoe UI, Helvetica Neue, sans-serif",
            // More host config options
            inputs: {
                allowDynamicallyFilteredChoiceSet: true
            }
        });

        // Set the adaptive card's event handlers. onExecuteAction is invoked
        // whenever an action is clicked in the card
        adaptiveCard.onExecuteAction = (action) => executeCardAction(action.data);

        // For markdown support you need a third-party library
        // E.g., to use markdown-it, include in your HTML page:
        //     <script type="text/javascript" src="https://unpkg.com/markdown-it/dist/markdown-it.js"></script>
        // And add this code to replace the default markdown handler:
        //     AdaptiveCards.AdaptiveCard.onProcessMarkdown = function (text, result) {
        //         result.outputHtml = markdownit().render(text);
        //         result.didProcess = true;
        //     };

        // Parse the card payload
        adaptiveCard.parse(cardDefinition);

        // Render the card to an HTML element:
        const $renderedCard = adaptiveCard.render();

        // And finally insert it somewhere in your page:
        $cardContainer.replaceChildren($renderedCard);

        // Scroll the card into view
        scrollElementIntoView($cardContainer);
    }

    // Executes a card cation
    async function executeCardAction(actionData) {
        if (isLoading) {
            // Already running
            return;
        }

        // show spinner
        try {
            showLoadingIndicator();

            const actionResponse = await sendRequest(`/api/automation/continue`, actionData);
            if (actionResponse.ok) {
                const cardResult = await actionResponse.json();
                sessionId = cardResult.sessionId;
                const status = cardResult.status;
                
                scrollOutputIntoView();
                hideLoadingIndicator();

                // Remove any current rendered card, they will be replaced with a new card or messages
                $cardContainer.replaceChildren();

                await emitMessage(cardResult.message);
                const continuationToken = cardResult.autoContinuationRequest;
                if (continuationToken) {
                    // Auto continue the request to next phase
                    await executeCardAction(continuationToken);
                }
                else {
                    // Render the card
                    await renderAdaptiveCard(cardResult.cardJSON);
                    if (status == "Completed") {
                        //$chainCardBtn.classList.remove("d-none");
                    }
                    if (status !== "Executing") {
                        // Stop live-view
                        await monitor?.endLiveView();
                    }
                }
            }
            else {
                await emitMessage("An error occurred. Please try again.")
                // End any ongoing live-view
                await monitor?.endLiveView();
            }
        }
        finally {
            hideLoadingIndicator();
        }
    }

    function waitFor(msec) {
        return new Promise(resolve => {
            window.setTimeout(() => resolve(), msec);
        })
    }

    function scrollElementIntoView(element, blockAlign){
        seamless.scrollIntoView(element, {
            behavior: "smooth",
            block: blockAlign ?? 'nearest'
        });
    }

    function scrollOutputIntoView() {
        const rect = $outputContainer.getBoundingClientRect();
        if ((rect.y + rect.height + 20) > window.innerHeight) {
            return scrollElementIntoView($outputContainer)
        }
    }

    function applyPlaygroundDefaults() {
        try {
            // If we previously saved card-details, retrieve them
            const defaultsJSON = window.localStorage.getItem(storageKey);
            if (defaultsJSON) {
                const defaults = JSON.parse(defaultsJSON);
                $cardUrl.value = defaults.url;
                $cardPath.value = defaults.path;
                $cardScript.value = defaults.script ?? null;
                $userMessage.value = defaults.userMessage ?? null;
            }
        }
        catch {
            // Clear out the storage since it seems corrupted
            localStorage.removeItem(storageKey);
        }
    }

    function showHideCardInput($element, hide) {
        if (hide) {
            $element.closest(".form-group").classList.add("d-none");
        }
        else {
            $element.closest(".form-group").classList.remove("d-none");
        }
    }

    function showHide($element, hide) {
        if (hide) {
            $element.classList.add("d-none");
        }
        else {
            $element.classList.remove("d-none");
        }
    }

    function savePlaygroundDefaults() {
        window.localStorage.setItem(storageKey, JSON.stringify({
            url: $cardUrl?.value,
            path: $cardPath.value,
            script: $cardScript.value,
            userMessage: $userMessage.value,
        }));
    }

    // Saves a partial of use prefs by merging with what we have
    let _currentUserPrefs;
    function saveUserPreferences(prefs) {
        const prefsJSON = window.localStorage.getItem(userPrefStorageKey);
        _currentUserPrefs = { ...((prefsJSON ? JSON.parse(prefsJSON) : null) ?? {}), ...prefs };
        window.localStorage.setItem(userPrefStorageKey, JSON.stringify(_currentUserPrefs));
    }

    function getUserPreferences() {
        if (!_currentUserPrefs) {
            const prefsJSON = window.localStorage.getItem(userPrefStorageKey);
            _currentUserPrefs = (prefsJSON ? JSON.parse(prefsJSON) : null) ?? {};
        }
        return _currentUserPrefs;
    }

    async function sendRequest(url, request) {
        const options = {
            method: 'POST',
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(request)
        };
        if (monitor) {
            options.headers = options.headers ?? {};
            // Ensure we have fresh monitor token
            const monitorSession = await monitor.getSession();
            options.headers["x-monitorsession"] = monitorSession;
        }
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                terminal?.showError(response.statusText);
            }
            return response;
        }
        catch (error) {
            terminal?.showError(error.message);
            throw error;
        }
    }

    function setPanelCollapse(panelEl, collapsed) {
        const panel = bootstrap.Collapse.getInstance(panelEl);
        if (panel) {
            if (collapsed) {
                panel.hide();
            }
            else {
                panel.show();
            }
        }
        else {
            // Not initialized yet, update classes to take default effect
            const collapeTrigger = document.querySelector(`[data-bs-target="#${panelEl.id}"]`)
            if (collapsed) {
                panelEl.classList.remove('show');
                collapeTrigger?.classList.add('collapsed');
                collapeTrigger?.setAttribute('aria-expanded', 'false');
            }
            else {
                panelEl.classList.add('show');
                collapeTrigger?.classList.remove('collapsed');
                collapeTrigger?.setAttribute('aria-expanded', 'true');
            }
        }
    }

    function trackPanelCollapse(panelEl, onToggle) {
        panelEl.addEventListener('hidden.bs.collapse', () => onToggle(true))
        panelEl.addEventListener('shown.bs.collapse', () => onToggle(false))
    }

    (() => {
        const _prefs = getUserPreferences();
        // Apply initial panel states based on saved user prefs
        setPanelCollapse($terminalPanel, !(_prefs.terminal ?? true));
    })();

    // Track panel states
    trackPanelCollapse($terminalPanel, collapsed => {
        saveUserPreferences({ terminal: !collapsed })
    })    

    // function launchLiveViewReplay() {
    //     const liveView = monitor?.liveViewStream;
    //     if (liveView && liveView.isClosed) {
    //         // We have a live-view that is closed, we can use it to launch the replay
    //         const modalBody = $liveViewReplayModal.querySelector(".modal-body");
    //         const originalParent = $liveViewVideo.parentElement;
    //         modalBody.appendChild($liveViewVideo);
    //         $liveViewVideo.controls = true;
    //         $liveViewVideo.classList.add('w-100');
    //         $liveViewReplayModal.addEventListener('hidden.bs.modal', () => {
    //             $liveViewVideo.controls = false;
    //             $liveViewVideo.pause();
    //             $liveViewVideo.classList.remove('w-100');
    //             originalParent.appendChild($liveViewVideo);
    //         }, { once: true });
    //         bootstrap.Modal.getOrCreateInstance($liveViewReplayModal).show();
    //     }
    // }

    // window.launchLiveViewReplay = launchLiveViewReplay;

    // Intiailize monitor socketio connection
    let monitor, terminal;
    window.setTimeout(async () => {
        const socket = io();
        let monitorSession;
        // Wait for the first connection
        await new Promise((resolve) => {
            socket.on("connect", async () => {
                // "connect" event is triggered on first-time connection and re-connections
                if(!monitorSession){
                    // This is the first time connection, so initialize a "start-session" request
                    monitorSession = await socket.emitWithAck("start-session");
                    resolve();
                }
                else{
                    await socket.emitWithAck("reconnect-session", monitorSession);
                }
            });
        })
        socket.on("logs", function (logs) {
            logs?.forEach(log => {
                if ($term) {
                    const timestamp = new Date(log.timestamp);
                    if (log.type > 1) {
                        terminal?.showError(log.message, timestamp)
                    }
                    else {
                        terminal?.showLog(log.message, timestamp)
                    }
                }
            });
        });
        let liveViewStream;
        socket.on("disconnect", (reason) => {
            if (!socket.active) {
              // Not a temporary disconnection
              monitorSession = null;
            }
          });
        monitor = window.monitor = {
            getSession() {
                return monitorSession;
            },
            isLiveViewActive() {
                return liveViewStream && !liveViewStream.isClosed;
            },
            async startLiveView() {
                if (liveViewStream && !liveViewStream.isClosed) {
                    return;
                }

                try {
                    // First start the live-view for the session
                    await socket.emitWithAck("start-liveview");

                    // Live view is starting
                    $outputContainer.classList.add("liveview-starting");
                    // No more rpelay possible of the previous video
                    $outputContainer.classList.remove("liveview-canreplay");

                    let onClose = [], closePromise, closed, started;

                    onClose.push(() => {
                        $outputContainer.classList.remove("liveview-active");
                        $outputContainer.classList.remove("liveview-starting");
                    })

                    liveViewStream = {
                        next: (data) => {
                            console.log(`Vide streaming chunk data received, length ${data?.length}`);
                            if(!started){
                                started = true;
                                $outputContainer.classList.remove("liveview-starting");
                                $outputContainer.classList.add("liveview-active");
                            }
                            // const ctx = $liveViewCanvas.getContext("2d");
                            // const image = new Image();
                            // image.onload = function() {
                            //     ctx.drawImage(image, 0, 0);
                            // };
                            // image.src = `data:image/webp;base64,${data}`;
                            //mediaStream.append(data);
                            $liveViewImage.src = `data:image/webp;base64,${data}`;
                        },
                        complete: () => {
                            console.log("Vide streaming ended");
                            //mediaStream.end();
                            closed = true;
                            onClose.forEach(c => c());
                        },
                        error: (err) => {
                            console.error(`Vide streaming error ${err}`);
                            closed = true;
                            onClose.forEach(c => c());
                        },
                        waitForClosing() {
                            if (!closed) {
                                return closePromise = closePromise ?? new Promise(resolve => {
                                    onClose.push(() => resolve());
                                })
                            }
                        },
                        get isClosed() {
                            return closed;
                        },
                    };
                    socket.on('liveview-chunk', data => liveViewStream?.next(data));
                    socket.on('liveview-end', () => {
                        socket.off('liveview-chunk');
                        socket.off('liveview-end');
                        liveViewStream?.complete();
                    })
                }
                catch (error) {
                    terminal?.showError(error.message);
                }
            },
            async endLiveView() {
                try {
                    if (liveViewStream && !liveViewStream.isClosed) {
                        console.log(`Requesting end of live stream`);
                        await socket.emitWithAck("end-liveview");
                        // Now wait for the live-view to actually close
                        await liveViewStream.waitForClosing();
                    }
                }
                catch (error) {
                    terminal?.showError(error.message);
                }
            },
            get liveViewStream() {
                return liveViewStream;
            },
        };
        const $term = window.$term = $('#terminal').terminal({}, {
            prompt: '> ',
            name: 'monitor',
            greetings : () => "Log terminal ready ...",
            enabled: false
        });
        $term.pause()
        window.terminal =  terminal = {
            showError(message, timestamp) {
                timestamp = timestamp ?? new Date();
                $term.echo(`[[;red;]${timestamp.toLocaleString()} - ${$.terminal.escape_formatting(message)}]`);
            },
            showLog(message, timestamp) {
                timestamp = timestamp ?? new Date();
                $term.echo(`${timestamp.toLocaleString()} - ${$.terminal.escape_formatting(message)}`);
            }
        }
    }, 50);
})();