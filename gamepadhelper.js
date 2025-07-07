import { guid, distBetweenPoints } from "common-helpers";
import IPH from "input-helper";

const userAgent = navigator.userAgent;

let runningOnAndroidTV = false;

if(userAgent) {
    const isAndroid = /Android/i.test(userAgent);
    const isTV = /TV/i.test(userAgent) || /AFT/.test(userAgent);

    if(isAndroid && isTV) {
        runningOnAndroidTV = true;
    }
}


const AXES_THRESHOLD = 0.55;
const GP_HILIGHT_PADDING = 12;

const STANDARD_BUTTONS = {
    0: "a",
    1: "b",
    2: "x",
    3: "y",
    4: "lb",
    5: "rb",
    6: "lt",
    7: "rt",
    8: "select",
    9: "start",
    10: "ls",
    11: "rs",
    12: "up",
    13: "down",
    14: "left",
    15: "right",
    16: "center",
    a1neg: "lup",
    a1pos: "ldown",
    a0neg: "lleft",
    a0pos: "lright",
    a3neg: "rup",
    a3pos: "rdown",
    a2neg: "rleft",
    a2pos: "rright"
};

const ANDROID_HOST_BUTTONS = {
    4:   1,         // back button
    19:  12,        // up
    20:  13,        // down
    21:  14,        // left
    22:  15,        // right
    23:  0,         // a
    96:  0,         // a
    97:  1,         // b
    99:  2,         // x
    100: 3,         // y
    102: 4,         // lb
    103: 5,         // rb
    106: 10,        // ls
    107: 11,        // rs
    108: 9,         // start
    109: 8,         // select
    130: 16,        // center
};

const FIRE_REMOTE_BUTTONS = {
    13: 0,          // select > a
    38: 12,         // up
    40: 13,         // down
    37: 14,         // left
    39: 15,         // right
    179: 9,         // play/pause > start
    227: 4,         // rewind > lb
    228: 5,         // fast forward > rb
    4: 1            // back > b
};

const VR_BUTTONS = {
    LEFT: {
        0: "lt",
        1: "lb",
        2: "unknown-left",
        3: "ls",
        4: "x",
        5: "y",
        "vrLeft.a2neg": "lleft",
        "vrLeft.a2pos": "lright",
        "vrLeft.a3neg": "lup",
        "vrLeft.a3pos": "ldown"
    },
    RIGHT: {
        0: "rt",
        1: "rb",
        2: "unknown-right",
        3: "rs",
        4: "a",
        5: "b",
        "vrRight.a2neg": "rleft",
        "vrRight.a2pos": "rright",
        "vrRight.a3neg": "rup",
        "vrRight.a3pos": "rdown"
    }
};

const TRADITIONAL_AXES_NAMES = {
    0: "leftX",
    1: "leftY",
    2: "rightX",
    3: "rightY"
};

const VR_AXES_NAMES = {
    LEFT: {
        2: "leftX",
        3: "leftY"
    },
    RIGHT: {
        2: "rightX",
        3: "rightY"
    }
};

let hostHandlesGamepad = false;
let registrations = {};
let totalReg = 0;
let vrSerssion = null;
let frameWasForced = false;
let manualPolling = false;
let ignoreKeyboard = false;
let scrollBehavior = "smooth";

let adl = null;
let adlSelectedItem = null;

let gamepadTitleItem = null;

let pads = {
    traditional: {},
    traditionalVelocities: {},
    vrLeft: null,
    vrRight: null,
    vrNone: null
};

if(window.Android && window.Android.hostHandlesGamepad) {
    hostHandlesGamepad = window.Android.hostHandlesGamepad();
    window.andPadEvent = onHostPadEvent;
}

requestAnimationFrame(onFrame);

window.addEventListener("gamepadconnected", onGamepadConnected);
window.addEventListener("gamepaddisconnected", onGamepadDisconnected);
window.addEventListener("keydown", onKeyDown);
window.addEventListener("keyup", onKeyUp);

class VirtualPad {
    constructor() {
        this.id = "virtPad." + guid();

        this.canvas = document.createElement("canvas");
        this.context = this.canvas.getContext("2d");

        this.leftStick = true;
        this.rightStick = true;

        this.buttons = [];

        this.touchstickLeftX = -1;
        this.touchstickLeftY = -1;
        this.touchstickLeftId = null;
        this.touchstickLeftMX = -1;
        this.touchstickLeftMY = -1;

        this.touchstickRightX = -1;
        this.touchstickRightY = -1;
        this.touchstickRightId = null;
        this.touchstickRightMX = -1;
        this.touchstickRightMY = -1;

        this.touchstickRadius = 80;

        this.downFunc = null;
        this.moveFunc = null;
        this.upFunc = null;

        this.noRender = false;
    }
    
    render() {
        renderVirtPad(this);
    }
}

export function register(options) {
    const regId = guid();

    registrations[regId] = {
        id: regId,
        up: null,
        down: null,
        velocity: null,
        vrSession: null,
        onConnect: null,
        onDisconnect: null,
        remotes: false
    };

    if(options.adl != undefined) {
        adl = options.adl;
    }

    if(options.remotes != undefined) {
        registrations[regId].remotes = options.remotes;
    }

    if(options.up != undefined) {
        registrations[regId].up = options.up;
    }

    if(options.down != undefined) {
        registrations[regId].down = options.down;
    }

    if(options.velocity != undefined) {
        registrations[regId].velocity = options.velocity;
    }

    if(options.vrSession != undefined) {
        vrSerssion = options.vrSession;
    }

    if(options.ignoreKeyboard != undefined) {
        ignoreKeyboard = options.ignoreKeyboard;
    }

    if(options.onConnect != undefined) {
        registrations[regId].onConnect = options.onConnect;
    }

    if(options.onDisconnect != undefined) {
        registrations[regId].onDisconnect = options.onDisconnect;
    }

    totalReg++;

    return regId;
}

export function unregister(id) {
    delete registrations[id];
    totalReg--;
}

export function standardButtonConversion(button) {
    if(STANDARD_BUTTONS[button]) {
        return STANDARD_BUTTONS[button];
    }

    return button;
}

export function vrPadButtonConversion(button, pad) {
    let prop = "RIGHT";

    if(pad == "left" || pad == "vrLeft") {
        prop = "LEFT";
    }

    if(VR_BUTTONS[prop][button]) {
        return VR_BUTTONS[prop][button];
    }

    return button;
}

export function vibrate(idx, duration) {
    const gamepad = navigator.getGamepads()[idx];

    if(gamepad && gamepad.vibrationActuator) {
        gamepad.vibrationActuator.playEffect("dual-rumble", {
            startDelay: 0,
            duration: duration,
            weakMagnitude: 1.0,
            strongMagnitude: 1.0,
        });
    } else {
        if(navigator.vibrate) {
            navigator.vibrate(duration);
        }
    }
}

export function forcePoll() {
    frameWasForced = true;
    onFrame();
    frameWasForced = false;
}

export function setManualPolling(setting) {
    manualPolling = setting;
}

export function setVRSession(session) {
    setTimeout(function(){
        pads = {
            traditional: {},
            traditionalVelocities: {},
            vrLeft: null,
            vrRight: null,
            vrNone: null
        };
    },500);

    vrSerssion = session;
}

export function checkIfADLUp() {
    const blocker = document.querySelectorAll(".adlBlocker");

    for(let i = 0; i < blocker.length; i++) {
        const b = blocker[i];

        if(b.style.display == "block") {
            return true;
        }
    }

    return false;
}

export function setADLInstance(adlInstance) {
    adl = adlInstance;
}

export function handleUIGamepadSelection(element, btn) {
    const button = convertButtonForADL(standardButtonConversion(btn));

    if(gamepadTitleItem && button == "left" || button == "right") {

        console.log(gamepadTitleItem);
        console.log(button);
        console.log(gamepadTitleItem.tagName);
        console.log(gamepadTitleItem.type );

        // is gamepadTitleItem an input with type range
        if(gamepadTitleItem.tagName == "INPUT" && gamepadTitleItem.type == "range") {
            // Handle range input specific logic
            if(button == "right") {
                gamepadTitleItem.value = Math.min(parseInt(gamepadTitleItem.value) + 1, parseInt(gamepadTitleItem.max));
            }

            if(button == "left") {
                gamepadTitleItem.value = Math.max(parseInt(gamepadTitleItem.value) - 1, parseInt(gamepadTitleItem.min));
            }

            gamepadTitleItem.dispatchEvent(new Event("input"));
            gamepadTitleItem.dispatchEvent(new Event("change"));
            return true;
        }
    }

    if(button == "up" || button == "left" || button == "right" || button == "down") {

        if(!gamepadTitleItem) {
            gamepadTitleItem = document.querySelector(".gamepadHighlighted");
        }

        if(!gamepadTitleItem) {
            // Find visible .adlGamepadSelected elements instead of just the first one
            const adlSelected = document.querySelectorAll(".adlGamepadSelected");
            for(let i = 0; i < adlSelected.length; i++) {
                const element = adlSelected[i];
                if(checkElementVisibility(element)) {
                    gamepadTitleItem = element;
                    break;
                }
            }
        }

        if(gamepadTitleItem && gamepadTitleItem.blur) {
            gamepadTitleItem.blur();
        }

        if(gamepadTitleItem) {
            const vis = checkElementVisibility(gamepadTitleItem);

            if(!vis) {
                gamepadTitleItem = null;
            }
        }

        const selectedElement = gamepadXYCheck(button, gamepadTitleItem, element);

        if(selectedElement) {

            let ok = true;
            let test = selectedElement;

            while(test.parentElement && ok) {
                if(getComputedStyle(test).display == "none") {
                    ok = false;
                }
                    
                test = test.parentElement;
            }

            if(ok) {
                highlightSelectedTitleElement(selectedElement, element);
            }
                
                
        }

        return true;
    }

    if(button == "a" && gamepadTitleItem) {

        gamepadTitleItem.click();

        if(gamepadTitleItem && gamepadTitleItem.tagName && (gamepadTitleItem.tagName == "input" || gamepadTitleItem.tagName == "textarea")) {
            if(window.Android && window.Android.forceOpenKeyboard) {
                window.Android.forceOpenKeyboard();
            }
    
            gamepadTitleItem.focus();
        }

        return true;
            
    }

    return false;
}

export function adlMenuPadDown(button) {
    button = convertButtonForADL(standardButtonConversion(button));

    if(button == "up" || button == "left" || button == "right" || button == "down") {

        const b = document.querySelector(".adlBlocker");

        if(b) {
            const selectedElement = gamepadXYCheck(button,adlSelectedItem,b);

            if(selectedElement) {

                const allCur = document.querySelectorAll(".adlGamepadSelectable");

                for(let i = 0; i < allCur.length; i++) {
                    const cur = allCur[i];

                    cur.classList.remove("gamepadHighlighted");
                    cur.classList.remove("adlGamepadSelected");
                }

                selectedElement.classList.add("adlGamepadSelected");
                adlSelectedItem = selectedElement;

                adlSelectedItem.scrollIntoView({
                    behavior: scrollBehavior,
                    block: "center"
                });
            }
        }

    }

    if(button == "a" && adlSelectedItem) {
        const item = adlSelectedItem;

        if(adlSelectedItem.classList.contains("adl-popup-menu-item")) {
            item.dispatchEvent(new PointerEvent("pointerdown"));
            item.dispatchEvent(new PointerEvent("pointerup"));
        } else {
            item.click();

            if(item.tagName && (item.tagName == "input" || item.tagName == "textarea" || item.tagName == "INPUT" || item.tagName == "TEXTAREA")) {
                if(window.Android && window.Android.forceOpenKeyboard) {
                    window.Android.forceOpenKeyboard();
                }

                item.focus();
            }
        }

        adlSelectedItem = null;
    }

    if(button == "b") {
        adlSelectedItem = null;
        adl.dismissDialogWindow();
    }
}

export function clearGamepadTitleItem() {
    if(gamepadTitleItem) {
        gamepadTitleItem.classList.remove("gamepadHighlighted");
    }

    gamepadTitleItem = null;
}

export function setGamepadTitleItem(ele) {
    clearGamepadTitleItem();

    if(ele) {
        ele.classList.add("gamepadHighlighted");
        gamepadTitleItem = ele;
    }
}

export function highlightSelectedTitleElement(element, baseElement) {
    if(!baseElement) {
        return;
    }

    const selectable = baseElement.querySelectorAll(".adlGamepadSelectable");

    for(let i = 0; i < selectable.length; i++) {
        const sel = selectable[i];

        if(sel == element) {
            sel.classList.add("gamepadHighlighted");
        } else {
            sel.classList.remove("gamepadHighlighted");
        }
    }

    if(element) {
        gamepadTitleItem = element;

        gamepadTitleItem.scrollIntoView({
            behavior: scrollBehavior,
            block: "center"
        });
    }
}

export function createVirtualPad(options) {
    const pad = new VirtualPad();

    if(options) {
        if(options.canvas != undefined) {
            pad.canvas = options.canvas;
            pad.context = pad.canvas.getContext("2d");
        }

        if(options.holder != undefined) {
            options.holder.appendChild(pad.canvas);

            pad.canvas.style.position = "absolute";
            pad.canvas.style.top = "0px";
            pad.canvas.style.left = "0px";
            pad.canvas.style.width = "100%";
            pad.canvas.style.height = "100%";
        }

        if(options.leftStick != undefined) {
            pad.leftStick = options.leftStick;
        }

        if(options.rightStick != undefined) {
            pad.rightStick = options.rightStick;
        }

        if(options.buttons != undefined) {
            pad.buttons = options.buttons;
        }

        if(options.touchstickRadius != undefined) {
            pad.touchstickRadius = options.touchstickRadius;
        }

        if(options.downFunc != undefined) {
            pad.downFunc = options.downFunc;
        }

        if(options.upFunc != undefined) {
            pad.upFunc = options.upFunc;
        }

        if(options.moveFunc != undefined) {
            pad.moveFunc = options.moveFunc;
        }
    }

    IPH.handleInput({
        element: pad.canvas,
        down: function(e) {
            if(pad.downFunc) {
                pad.downFunc(e);
            }

            if(e.type == "touch") {

                if(pad.buttons) {
                    for(let i = 0; i < pad.buttons.length; i++) {
                        const button = pad.buttons[i];

                        const dist = distBetweenPoints(button.x, button.y, e.x, e.y);

                        if(dist < button.radius) {
                            button.pressed = true;
                            button.pressedId = e.id;

                            if(button.callback) {
                                button.callback();
                                return;
                            }

                            if(button.idx != undefined) {
                                reportDown(pad.id, button.idx);
                                return;
                            }
                        }
                    }
                }

                if(pad.leftStick || pad.rightStick) {
                    let useStick = "left";

                    if(!pad.leftStick) {
                        useStick = "right";
                    }
        
                    if(pad.rightStick && e.x > pad.canvas.width / 2) {
                        useStick = "right";
                    }
        
                    if(useStick == "left") {
                        pad.touchstickLeftX = e.x;
                        pad.touchstickLeftY = e.y;
                        pad.touchstickLeftId = e.id;
                        pad.touchstickLeftMX = e.x;
                        pad.touchstickLeftMY = e.y;
        
                        reportVirtLeftTouchMove(pad);
                    } else {
                        pad.touchstickRightX = e.x;
                        pad.touchstickRightY = e.y;
                        pad.touchstickRightId = e.id;
                        pad.touchstickRightMX = e.x;
                        pad.touchstickRightMY = e.y;
        
                        reportVirtRightTouchMove(pad);
                    }
                }
                    
            }
        },
        move: function(e) {
            if(pad.moveFunc) {
                pad.moveFunc(e);
            }

            if(e.type == "touch") {
                if(pad.leftStick && e.id == pad.touchstickLeftId) {
                    pad.touchstickLeftMX = e.x;
                    pad.touchstickLeftMY = e.y;

                    reportVirtLeftTouchMove(pad);
                }

                if(pad.rightStick && e.id == pad.touchstickRightId) {
                    pad.touchstickRightMX = e.x;
                    pad.touchstickRightMY = e.y;

                    reportVirtRightTouchMove(pad);
                }
            }
        },
        up: function(e) {
            if(pad.upFunc) {
                pad.upFunc(e);
            }

            if(e.type == "touch") {

                if(pad.buttons) {
                    for(let i = 0; i < pad.buttons.length; i++) {
                        const button = pad.buttons[i];

                        if(button.pressed && button.pressedId == e.id) {
                            button.pressed = false;
                            button.pressedId = null;
            
                            if(button.upBack) {
                                button.upBack();
                                return;
                            }

                            if(button.idx != undefined) {
                                reportUp(pad.id, button.idx);
                                return;
                            }
                        }
                    }
                }

                if(pad.leftStick && e.id == pad.touchstickLeftId) {
                    pad.touchstickLeftX = -1;
                    pad.touchstickLeftY = -1;
                    pad.touchstickLeftId = null;
                    pad.touchstickLeftMX = -1;
                    pad.touchstickLeftMY = -1;

                    reportVelocity(pad.id, 1, 0);
                    reportVelocity(pad.id, 0, 0);
                }

                if(pad.rightStick && e.id == pad.touchstickRightId) {
                    pad.touchstickRightX = -1;
                    pad.touchstickRightY = -1;
                    pad.touchstickRightId = null;
                    pad.touchstickRightMX = -1;
                    pad.touchstickRightMY = -1;

                    reportVelocity(pad.id, 3, 0);
                    reportVelocity(pad.id, 2, 0);
                }

            }
        }
    });


    return pad;
}

export function setScrollBehavior(behavior) {
    scrollBehavior = behavior;
}

function onHostPadEvent(action, id, key) {

    const conv = ANDROID_HOST_BUTTONS[key];

    // down
    if(action == 0) {
        reportDown(id, conv);
    }

    // up
    if(action == 1) {
        reportUp(id, conv);
    }

}

function reportDown(pad, button) {

    if(adl && checkIfADLUp()) {
        adlMenuPadDown(button);
        return;
    }

    if(pad == "remote" && ignoreKeyboard) {
        return;
    }

    for(let regid in registrations) {
        const registration = registrations[regid];

        if(registration.down) {
            registration.down(pad,button);
        }
    }
}

function reportUp(pad,button) {

    if(adl && checkIfADLUp()) {
        return;
    }

    if(pad == "remote" && ignoreKeyboard) {
        return;
    }

    for(let regid in registrations) {
        const registration = registrations[regid];

        if(registration.up) {
            registration.up(pad,button);
        }
    }
}

function renderVirtPad(pad) {
    const parent = pad.canvas.parentElement;

    if(!parent || !pad || !pad.context) {
        return;
    }

    const w = parseInt(parent.offsetWidth);
    const h = parseInt(parent.offsetHeight);

    if(w == 0 || h == 0) {
        return;
    }

    pad.canvas.width = w;
    pad.canvas.height = h;

    if(pad.noRender) {
        return;
    }

    if(pad.leftStick && pad.touchstickLeftX > -1 && pad.touchstickLeftY > -1) {
        renderTouchStick(pad.context, pad.touchstickRadius, pad.touchstickLeftX, pad.touchstickLeftY, pad.touchstickLeftMX, pad.touchstickLeftMY);
    }

    if(pad.rightStick && pad.touchstickRightX > -1 && pad.touchstickRightY > -1) {
        renderTouchStick(pad.context, pad.touchstickRadius, pad.touchstickRightX, pad.touchstickRightY, pad.touchstickRightMX, pad.touchstickRightMY);
    }

    if(pad.buttons) {
        for(let i = 0; i < pad.buttons.length; i++) {
            const button = pad.buttons[i];
            renderTouchButton(pad.canvas, pad.context, button);
        }
    }
}

function renderTouchStick(context, rad, cx, cy, sx, sy) {
    context.strokeStyle = "#ffffff";
    context.fillStyle = "rgba(255, 255, 255, 0.4)";

    context.beginPath();
    context.arc(cx, cy, rad, 0, Math.PI * 2);
    context.stroke();

    context.beginPath();
    context.arc(sx, sy, Math.ceil(rad * 0.3), 0, Math.PI * 2);
    context.fill();
}

function renderTouchButton(canvas, context, button) {
    let x = 0;
    let y = 0;

    let radius = 24;

    if(button.radius) {
        radius = button.radius;
    }

    if(button.left) {
        x = button.left;
        x += radius;
    }

    if(button.right) {
        x = canvas.width - button.right;
        x -= radius;

    }

    if(button.top) {
        y = button.top;
        y += radius;
    }

    if(button.bottom) {
        y = canvas.height - button.bottom;
        y -= radius;
    }

    if(button.stroke) {
        context.strokeStyle = button.stroke;
    } else {
        context.strokeStyle = "#ffffff";
    }

    if(button.fill) {
        context.fillStyle = button.fill;
    } else {
        context.fillStyle = "rgba(255, 255, 255, 0.5)";
    }

    const exWidth = context.lineWidth;

    context.lineWidth = 1;

    context.beginPath();
    context.arc(x, y, radius, 0, 2 * Math.PI);
    context.fill();

    context.beginPath();
    context.arc(x, y, radius, 0, 2 * Math.PI);
    context.stroke();

    if(button.glyph) {
        const useIcon =  String.fromCharCode("0x" + button.glyph.replace("fluent.&#x","").replace("&#x","").replace(";",""));

        context.font = "bold " + Math.round(radius * 0.75) + "px fluent";
        context.textAlign = "center";
        context.textBaseline = "middle";

        if(button.glyphColor) {
            context.fillStyle = button.glyphColor;
        } else {
            context.fillStyle = "#ffffff";
        }
        
        context.strokeStyle = "#000000";
        context.lineWidth = 4;

        context.fillText(useIcon, x, y);
        context.strokeText(useIcon, x, y);
        context.fillText(useIcon, x, y);
    }

    context.lineWidth = exWidth;

    button.x = x;
    button.y = y;
    button.radius = radius;
}

function onFrame() {

    if(hostHandlesGamepad) {
        return;
    }

    if(!manualPolling && !frameWasForced) {
        requestAnimationFrame(onFrame);
    }
    

    if(totalReg <= 0) {
        totalReg = 0;
        return;
    }

    if(!("getGamepads" in navigator)) {
        return;
    }

    const gamepads = navigator.getGamepads();

    for(let p = 0; p < gamepads.length; p++) {
        const gamepad = gamepads[p];

        if(!gamepad || !gamepad.connected) {
            continue;
        }

        const idx = gamepad.index;

        let buttonStates = pads.traditional[idx];

        if(!buttonStates) {
            pads.traditional[idx] = {};
            buttonStates = pads.traditional[idx];
        }

        for(let i = 0; i < gamepad.buttons.length; i++) {
            const button = gamepad.buttons[i];

            if(button.pressed) {
                if(!buttonStates[i]) {
                    buttonStates[i] = true;
                    reportDown(idx,i);
                }
            } else {
                if(buttonStates[i]) {
                    buttonStates[i] = false;
                    reportUp(idx,i);
                }
            }
        }

        for(let i = 0; i < gamepad.axes.length; i++) {
            const axis = gamepad.axes[i];
            const bName = "a" + i;

            const fName = bName + "pos";
            const gName = bName + "neg";

            if(axis > AXES_THRESHOLD) {
                if(!buttonStates[fName]) {
                    buttonStates[fName] = true;
                    reportDown(idx,fName);
                }
            } else {
                if(buttonStates[fName]) {
                    buttonStates[fName] = false;
                    reportUp(idx,fName);
                }
            }


            if(axis < -AXES_THRESHOLD) {
                if(!buttonStates[gName]) {
                    buttonStates[gName] = true;
                    reportDown(idx,gName);
                }
            } else {
                if(buttonStates[gName]) {
                    buttonStates[gName] = false;
                    reportUp(idx,gName);
                }
            }

            reportVelocity(idx,i,axis);
        }
    }

    if(vrSerssion && vrSerssion.inputSources) {
        for(let i = 0; i < vrSerssion.inputSources.length; i++) {
            const is = vrSerssion.inputSources[i];

            if(!is.gamepad) {
                continue;
            }

            const vrPad = is.gamepad;


            if(is.handedness && vrPad.buttons) {
                let padProp = "vrRight";

                if(is.handedness == "left") {
                    padProp = "vrLeft";
                }

                let buttonStates = pads[padProp];

                if(!buttonStates) {
                    pads[padProp] = {};
                    buttonStates = pads[padProp];
                }

                for(let i = 0; i < vrPad.buttons.length; i++) {
                    const button = vrPad.buttons[i];

                    if(button.pressed) {
                        if(!buttonStates[i]) {
                            buttonStates[i] = true;
                            reportDown(padProp, i);
                        }
                    } else {
                        if(buttonStates[i]) {
                            buttonStates[i] = false;
                            reportUp(padProp, i);
                        }
                    }
                }

                if(vrPad.axes) {
                    for(let i = 0; i < vrPad.axes.length; i++) {
                        const axisName = is.handedness + ".a" + i;

                        const axisNamePos = axisName + "pos";
                        const axisNameNeg = axisName + "neg";

                        const axis = vrPad.axes[i];

                        if(axis > AXES_THRESHOLD) {
                            if(!buttonStates[axisNamePos]) {
                                buttonStates[axisNamePos] = true;
                                reportDown(padProp,axisNamePos);
                            }
                        } else {
                            if(buttonStates[axisNamePos]) {
                                buttonStates[axisNamePos] = false;
                                reportUp(padProp,axisNamePos);
                            }
                        }

                        if(axis < -AXES_THRESHOLD) {
                            if(!buttonStates[axisNameNeg]) {
                                buttonStates[axisNameNeg] = true;
                                reportDown(padProp,axisNameNeg);
                            }
                        } else {
                            if(buttonStates[axisNameNeg]) {
                                buttonStates[axisNameNeg] = false;
                                reportUp(padProp,axisNameNeg);
                            }
                        }

                        reportVelocity(padProp, i, axis);
                    }

                    
                }
            }



        }
    }
}

function reportVelocity(pad, axis, val) {

    if(adl && checkIfADLUp()) {
        return;
    }

    let useConst = TRADITIONAL_AXES_NAMES;
    let usePads = pads.traditionalVelocities;

    if(pad == "vrLeft") {
        useConst = VR_AXES_NAMES.LEFT;
    }

    if(pad == "vrRight") {
        useConst = VR_AXES_NAMES.RIGHT;
    }

    const axisName = useConst[axis];

    if(!axisName) {
        return;
    }

    if(!usePads[pad]) {
        usePads[pad] = {};
    }

    if(!usePads[pad][axis]) {
        usePads[pad][axis] = 0;
    }

    const old = usePads[pad][axis];

    if(val == old) {
        return;
    }

    for(let regid in registrations) {
        const registration = registrations[regid];

        if(registration.velocity) {
            registration.velocity(pad, axisName, val);
        }
    }

    usePads[pad][axis] = val;
}

function onGamepadConnected(e) {
    const gp = navigator.getGamepads()[e.gamepad.index];

    if(gp) {

        pads.traditional[gp.index] = {};

        for(let regid in registrations) {
            const registration = registrations[regid];

            if(registration.onConnect) {
                registration.onConnect({
                    reg: registration.id,
                    idx: e.gamepad.index,
                    id: e.gamepad.id,
                    buttons: e.gamepad.buttons.length,
                    axes: e.gamepad.axes.length
                });
            }
        }
    }
}

function onGamepadDisconnected(e) {
    const gp = navigator.getGamepads()[e.gamepad.index];

    if(gp) {

        delete pads.traditional[gp.index];

        for(let regid in registrations) {
            const registration = registrations[regid];

            if(registration.onDisconnect) {
                registration.onDisconnect({
                    reg: registration.id,
                    idx: e.gamepad.index
                });
            }
        }
    }
}

function onKeyDown(e) {

    

    if(e && e.keyCode) {
        const button = FIRE_REMOTE_BUTTONS[e.keyCode];

        if (runningOnAndroidTV && button != undefined) {
            e.preventDefault();

            reportDown("remote", button);
        }
    }
}

function onKeyUp(e) {

    if(e && e.keyCode) {
        const button = FIRE_REMOTE_BUTTONS[e.keyCode];

        if (runningOnAndroidTV && button != undefined) {
            e.preventDefault();

            reportUp("remote", button);
        }

    }
}

function convertButtonForADL(button) {
    if(button == "lleft") {
        return "left";
    }

    if(button == "lup") {
        return "up";
    }

    if(button == "lright") {
        return "right";
    }

    if(button == "ldown") {
        return "down";
    }

    return button;
}

function reportVirtLeftTouchMove(pad) {
    if(!pad.leftStick) {
        return;
    }

    let xDiff = pad.touchstickLeftMX - pad.touchstickLeftX;
    let yDiff = pad.touchstickLeftMY - pad.touchstickLeftY;

    if(xDiff > pad.touchstickRadius) {
        xDiff = pad.touchstickRadius;
    }

    if(xDiff < -pad.touchstickRadius) {
        xDiff = -pad.touchstickRadius;
    }

    if(yDiff > pad.touchstickRadius) {
        yDiff = pad.touchstickRadius;
    }

    if(yDiff < -pad.touchstickRadius) {
        yDiff = -pad.touchstickRadius;
    }

    const xPer = xDiff / pad.touchstickRadius;
    const yPer = yDiff / pad.touchstickRadius;

    reportVelocity(pad.id, 1, yPer);
    reportVelocity(pad.id, 0, xPer);
}

function reportVirtRightTouchMove(pad) {

    if(!pad.rightStick) {
        return;
    }

    let xDiff = pad.touchstickRightMX - pad.touchstickRightX;
    let yDiff = pad.touchstickRightMY - pad.touchstickRightY;

    if(xDiff > pad.touchstickRadius) {
        xDiff = pad.touchstickRadius;
    }

    if(xDiff < -pad.touchstickRadius) {
        xDiff = -pad.touchstickRadius;
    }

    if(yDiff > pad.touchstickRadius) {
        yDiff = pad.touchstickRadius;
    }

    if(yDiff < -pad.touchstickRadius) {
        yDiff = -pad.touchstickRadius;
    }

    const xPer = xDiff / pad.touchstickRadius;
    const yPer = yDiff / pad.touchstickRadius;

    reportVelocity(pad.id, 3, yPer);
    reportVelocity(pad.id, 2, xPer);
}

function gamepadXYCheck(direction, compareElement, useParent) {

    let nextElement = null;

    if(!useParent) {
        useParent = null;
    }

    const elements = getGamepadSelectableElements(useParent);

    if(elements.length == 0) {
        return nextElement;
    }

    if(!compareElement || elements.indexOf(compareElement) == -1) {
        compareElement = elements[0];
        return compareElement;
    }

    nextElement = elements[0];

    const checkBounds = compareElement.getBoundingClientRect();
    let closestElement = 999999;

    for(let i = 0; i < elements.length; i++) {
        const element = elements[i];

        if(element == compareElement) {
            continue;
        }

        const bounds = element.getBoundingClientRect();

        let doCheck = false;

        if(direction == "right") {
            if(bounds.left >= checkBounds.right - GP_HILIGHT_PADDING) {
                doCheck = true;
            }
        }

        if(direction == "left") {
            if(bounds.right <= checkBounds.left + GP_HILIGHT_PADDING) {
                doCheck = true;
            }
        }

        if(direction == "up") {
            if(bounds.bottom <= checkBounds.top + GP_HILIGHT_PADDING) {
                doCheck = true;
            }
        }

        if(direction == "down") {
            if(bounds.top >= checkBounds.bottom - GP_HILIGHT_PADDING) {
                doCheck = true;
            }
        }

        if(doCheck) {

            const centerCheck = getBoundsCenterPosition(checkBounds);
            const center = getBoundsCenterPosition(bounds);

            const dist = distBetweenPoints(centerCheck.x, centerCheck.y, center.x, center.y);

            if(dist < closestElement) {
                nextElement = element;
                closestElement = dist;
            }
        }
    }

    return nextElement;
}

function getBoundsCenterPosition(bounds) {
    return {
        x: bounds.left + (bounds.width / 2),
        y: bounds.top + (bounds.height / 2)
    };
}

function getGamepadSelectableElements(useParent = null) {

    let checkEle = document;

    if(useParent) {
        checkEle = useParent;
    }

    if(checkIfADLUp()) {
        checkEle = document.querySelector(".adlBlocker");
    }

    if(!checkEle) {
        checkEle = document;
    }

    const allEles = checkEle.querySelectorAll(".adlGamepadSelectable");
    const selectableEles = [];

    for(let i = 0; i < allEles.length; i++) {
        const element = allEles[i];
        const visible = checkElementVisibility(element);

        /*
        let visible = true;
        let parent = element;

        while(parent && visible) {

            const style = getComputedStyle(parent);

            if(style.display == "none") {
                visible = false;
            }

            if(style.visibility == "hidden") {
                visible = false;
            }

            if(style.opacity == "0") {
                visible = false;
            }

            if(parent.style.display == "none") {
                visible = false;
            }

            parent = parent.parentElement;
        }*/

        if(visible) {
            selectableEles.push(element);
        }
    }

    return selectableEles;
}

function checkElementVisibility(element) {
    if(!element) {
        return false;
    }

    const style = getComputedStyle(element);

    if(style.display == "none") {
        return false;
    }

    if(style.visibility == "hidden") {
        return false;
    }

    if(style.opacity == "0") {
        return false;
    }

    let parent = element.parentElement;

    if(parent) {
        return checkElementVisibility(parent);
    }

    return true;
}

export default {
    register,
    unregister,
    standardButtonConversion,
    vrPadButtonConversion,
    vibrate,
    forcePoll,
    setManualPolling,
    setVRSession,
    checkIfADLUp,
    setADLInstance,
    handleUIGamepadSelection,
    adlMenuPadDown,
    clearGamepadTitleItem,
    setGamepadTitleItem,
    highlightSelectedTitleElement,
    createVirtualPad,
    setScrollBehavior
};