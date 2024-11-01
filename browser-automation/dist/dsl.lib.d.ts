/** 
 * DSL script uses a concept of Selector, which is a string and is similar to a CSS selector, 
 * but only using the {@link https://developer.mozilla.org/en-US/docs/Glossary/Accessibility_tree | Accessibility Tree} of the web interface. 
 * A Selector is used to identify some UI element that the user wants to reference. {@link https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles | ARIA Role} of an 
 * element and its {@link https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes | properties} can be used in the selector. 
 * Here are some examples: 
 *    - Selector for an element with an ARIA role *thing* is `thing`, e.g., `button`, `combobox`, `dialog` etc.
 *    - Selector for an elmenent with an accessible name (i.e. label) "Foo" is `[name="Foo"]`.
 *    - Selector for button named "Foo" is `button[name="Foo"]`
 *    - Selector for any required field is `[required=true]`
 *    - Selector for a field named "Foo" and only if it is required is `[name="Foo"][required=true]`
 *    - Select for an element Foo under Bar is `[name="Bar"] [name="Foo"]`
 *    - Multiple selector can be combined with comma to imply a collection of those elements, e.g., `[name="Bar"],[name="Foo"]`
 */
declare type Selector = string | CSSSelector;

/**
 * A semantic condition can be a NL string (e.g. a question) or a real boolean value.
 * If your condition is based on the input, then you would want to formulate it as a NL text question. 
 * While formulating the question, think about it as something that an agent would ask the user. 
 * Here are some examples -
 * - `Add another item to the order?`
 * - `Select color and size for your item?`
 * - `Have another expense to process?`
 * 
 * If your condition, on the other hand, is based on a state, you can just pass a real boolean value. 
 * Typically, such state-bound conditions are obtained from other functions, e.g., {@link Exists} or from your own state variables
 */
declare type SemanticCondition = string | boolean;

/**
 * Use this function to perform a click of a button, switch to a tab and other click interactions on an element. 
 * User will need to identify the element by a name which is specified in the selector.
 * @param selector 
 */
declare function Select(selector: Selector) : void;

/**
 * Use this function when user wants to collect inputs from outside at a particular step during the automation. 
 * It can also be used to present information back to the user. Use scope parameter to narrow down which part of the UI to be inspected (e.g. dialog, main, a specific section etc.).
 * If the user didn't specify, leave it blank. Use include parameter to identify which elements are to be presented (e.g. named element, or required field etc.). 
 * Use exclude parameter to identify which elements to be omitted. Use title and description to best describe the prompt.
 * @param options 
 */
declare function Present(options?: { select: Selector, include?: Selector, exclude?: Selector, title?: string, description?: string }): void;

/**
 * Use this function to present a simple decision making screen to the user with a few choices and obtain the selected choice value
 * @param options 
 */
declare function Confirm(options: { title?: string, description?: string, label: string, choices: string[]}) : string;

/**
 * Use this function to process a repeating sub-task. 
 * Action parameter is a lambda function which contains DSL statements. 
 * Condition parameter is typically a question, such as, "Add another item?", "Attach another receipt?", "Approve another order?" etc. 
 * For each iteration, it is recommended to include a Note() inside the action lambda to indicate the index of the iteration (e.g. "Working on item #1" etc.).
 * @param action Action to perform for each iteration
 * @param condition Condition to check at the end of each iteration
 */
declare function DoWhile(action:(index:number) => void, condition: SemanticCondition) : void;

/**
 * Use this to include a free form instruction for the automation engine. This is used to explain the process, and remove ambiguity in subsequent steps.
 * @param message Message to include
 */
declare function Note(message: string): void;

/**
 * Use this function to check if there is any element in the application that matches the given selector at the current state of execution
 * @param selector Any valid selector identifying an element in the application
 */
declare function Exists(selector: Selector) : boolean;
/**
 * Use this function to check a condition and if it is semantically true, execute the action. If false, exceute the elseAction (if provided).
 * @param condition Condition to be checked
 * @param action Action to be taken when the condition is satisfied
 * @param elseAction Alternate action to be taken if the condition is NOT satisfied
 */
declare function If(condition: SemanticCondition, action:() => void, elseAction?:() => void): void;

/**
 * Use this function to check for a condition and keep waiting until it is NO longer true. Default poll interval is 500ms and timeout is 60s. 
 * You can provide custom timeout and polling interval, if needed. Custom polling interval must be within 300ms and 5s. Custom timeout must be within 1s and 600s
 * @param condition Condition to check periodically (via polling). You must return a boolean value. Returning `true` will continue to wait the operation, while `false` will end waiting.
 * @param options 
 */
declare function WaitWhile(condition: () => boolean, options?: { timeout?: number, pollInterval?: number }): void;

/**
 * Use this function to check the given condition and if it is NOT semantically true, throw an error from the execution with the given error message
 * @param condition Condition to check
 * @param errorMessage Error message to log and display if the assertion fails
 */
declare function Assert(condition: boolean, errorMessage: string): void;

// Following globals types are required by the TS compiler
interface Array<T> {}
interface Boolean {}
interface Function {}
interface IArguments {}
interface Number {}
interface Object {}
interface String {}
interface RegExp {}

// Following is a hack to force TS compiler treating Selector as a unique type
declare abstract class CSSSelector {
   private _:string;
}