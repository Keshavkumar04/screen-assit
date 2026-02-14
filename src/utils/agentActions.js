// Agent actions using nut-js for desktop automation
// These run in the main process (need native access)

let nutjsLoaded = false;
let mouse, keyboard, Key, Button, Point;

async function loadNutJs() {
    if (nutjsLoaded) return true;
    try {
        const nutjs = require('@nut-tree-fork/nut-js');
        mouse = nutjs.mouse;
        keyboard = nutjs.keyboard;
        Key = nutjs.Key;
        Button = nutjs.Button;
        Point = nutjs.Point;
        nutjsLoaded = true;
        return true;
    } catch (error) {
        console.error('Failed to load nut-js:', error.message);
        return false;
    }
}

async function executeClick(x, y) {
    if (!await loadNutJs()) throw new Error('nut-js not available');
    await mouse.setPosition(new Point(x, y));
    await mouse.click(Button.LEFT);
    console.log(`Clicked at (${x}, ${y})`);
}

async function executeTypeText(text) {
    if (!await loadNutJs()) throw new Error('nut-js not available');
    await keyboard.type(text);
    console.log(`Typed: "${text}"`);
}

async function executeScroll(direction, amount = 3) {
    if (!await loadNutJs()) throw new Error('nut-js not available');
    const scrollAmount = Math.abs(amount);
    if (direction === 'up') {
        await mouse.scrollUp(scrollAmount);
    } else {
        await mouse.scrollDown(scrollAmount);
    }
    console.log(`Scrolled ${direction} by ${scrollAmount}`);
}

async function executeAgentAction(action) {
    switch (action.type) {
        case 'click':
            await executeClick(action.x, action.y);
            break;
        case 'type':
            await executeTypeText(action.text);
            break;
        case 'scroll':
            await executeScroll(action.direction, action.amount);
            break;
        default:
            throw new Error(`Unknown action type: ${action.type}`);
    }
}

module.exports = {
    executeClick,
    executeTypeText,
    executeScroll,
    executeAgentAction,
};
