## Core Concepts

### Selector

> **Selector**: `string` \| `CSSSelector`

DSL script uses a concept of Selector, which is a string and is similar to a CSS selector, 
but only using the [Accessibility Tree](https://developer.mozilla.org/en-US/docs/Glossary/Accessibility_tree) of the web interface. 
A Selector is used to identify some UI element that the user wants to reference. [ARIA Role](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles) of an 
element and its [properties](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes) can be used in the selector. 
Here are some examples: 
   - Selector for an element with an ARIA role *thing* is `thing`, e.g., `button`, `combobox`, `dialog` etc.
   - Selector for an elmenent with an accessible name (i.e. label) "Foo" is `[name="Foo"]`.
   - Selector for button named "Foo" is `button[name="Foo"]`
   - Selector for any required field is `[required=true]`
   - Selector for a field named "Foo" and only if it is required is `[name="Foo"][required=true]`
   - Select for an element Foo under Bar is `[name="Bar"] [name="Foo"]`
   - Multiple selector can be combined with comma to imply a collection of those elements, e.g., `[name="Bar"],[name="Foo"]`

***

### SemanticCondition

> **SemanticCondition**: `string` \| `boolean`

A semantic condition can be a NL string (e.g. a question) or a real boolean value.
If your condition is based on the input, then you would want to formulate it as a NL text question. 
While formulating the question, think about it as something that an agent would ask the user. 
Here are some examples -
- `Add another item to the order?`
- `Select color and size for your item?`
- `Have another expense to process?`

If your condition, on the other hand, is based on a state, you can just pass a real boolean value. 
Typically, such state-bound conditions are obtained from other functions, e.g., [Exists](#exists) or from your own state variables

## Functions

### Assert()

> **Assert**(`condition`, `errorMessage`): `void`

Use this function to check the given condition and if it is NOT semantically true, throw an error from the execution with the given error message

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `condition` | `boolean` | Condition to check |
| `errorMessage` | `string` | Error message to log and display if the assertion fails |

#### Returns

`void`

***

### Confirm()

> **Confirm**(`options`): `string`

Use this function to present a simple decision making screen to the user with a few choices and obtain the selected choice value

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | `object` |  |
| `options.choices` | `string`[] \| `object`[] | - |
| `options.description`? | `string` | - |
| `options.label` | `string` | - |
| `options.style`? | `"expanded"` \| `"compact"` | - |
| `options.title`? | `string` | - |

#### Returns

`string`

***

### DoWhile()

> **DoWhile**(`action`, `condition`): `void`

Use this function to process a repeating sub-task. 
Action parameter is a lambda function which contains DSL statements. 
Condition parameter is typically a question, such as, "Add another item?", "Attach another receipt?", "Approve another order?" etc. 
For each iteration, it is recommended to include a Note() inside the action lambda to indicate the index of the iteration (e.g. "Working on item #1" etc.).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `action` | (`index`) => `void` | Action to perform for each iteration |
| `condition` | [`SemanticCondition`](#semanticcondition) | Condition to check at the end of each iteration |

#### Returns

`void`

***

### Exists()

> **Exists**(`selector`): `boolean`

Use this function to check if there is any element in the application that matches the given selector at the current state of execution

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `selector` | [`Selector`](#selector) | Any valid selector identifying an element in the application |

#### Returns

`boolean`

***

### If()

> **If**(`condition`, `action`, `elseAction`?): `void`

Use this function to check a condition and if it is semantically true, execute the action. If false, exceute the elseAction (if provided).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `condition` | [`SemanticCondition`](#semanticcondition) | Condition to be checked |
| `action` | () => `void` | Action to be taken when the condition is satisfied |
| `elseAction`? | () => `void` | Alternate action to be taken if the condition is NOT satisfied |

#### Returns

`void`

***

### Inspect()

> **Inspect**(`options`): [`ARIANode`](#arianode)[]

Use this function to inspect and query the current accessible UI state of the underlying app. 
All matching elements for the given selector will be returned as a collection of [ARIANode](#arianode) objects

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | `object` |  |
| `options.selector` | [`Selector`](#selector) | - |

#### Returns

[`ARIANode`](#arianode)[]

***

### JSONParse()

> **JSONParse**(`text`): `any`

Use this function to converts a JavaScript Object Notation (JSON) string into an object.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `text` | `string` | A valid JSON string. |

#### Returns

`any`

***

### JSONStringify()

> **JSONStringify**(`value`, `space`?): `string`

Use this function to converts a value to a JavaScript Object Notation (JSON) string.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `value` | `any` | A value, usually an object or array, to be converted. |
| `space`? | `string` \| `number` | Adds indentation, white space, and line break characters to the return-value JSON text to make it easier to read. |

#### Returns

`string`

***

### Log()

> **Log**(`message`): `void`

Use this function to log a message from your DSL script that can be seen in the logs window in the Playground and other places

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `message` | `string` | Message to log |

#### Returns

`void`

***

### Note()

> **Note**(`message`): `void`

Use this to include a free form instruction for the automation engine. This is used to explain the process, and remove ambiguity in subsequent steps.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `message` | `string` | Message to include |

#### Returns

`void`

***

### Present()

> **Present**(`options`?): `void`

Use this function when user wants to collect inputs from outside at a particular step during the automation. 
It can also be used to present information back to the user. Use scope parameter to narrow down which part of the UI to be inspected (e.g. dialog, main, a specific section etc.).
If the user didn't specify, leave it blank. Use include parameter to identify which elements are to be presented (e.g. named element, or required field etc.). 
Use exclude parameter to identify which elements to be omitted. Use title and description to best describe the prompt.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options`? | `object` |  |
| `options.description`? | `string` | - |
| `options.exclude`? | [`Selector`](#selector) | - |
| `options.include`? | [`Selector`](#selector) | - |
| `options.select`? | [`Selector`](#selector) | - |
| `options.title`? | `string` | - |

#### Returns

`void`

***

### Select()

> **Select**(`selector`, `options`?): `void`

Use this function to perform a click of a button, switch to a tab and other click interactions on an element. 
User will need to identify the element by a name which is specified in the selector.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `selector` | [`Selector`](#selector) |  |
| `options`? | `object` | - |
| `options.useGesture`? | `boolean` | Indicates if a click is to be performed using a simulated user gesture (e.g. simulated mouse click on the screen) Default is false and click operation is normally performed directly using JavaScript regardless of the visual state of the element. This makes the click operation fast and reliable. When using the gesture, the element is first checked to make sure that it is clickable (i.e. not hidden, or not inaccessible or not disabled) and then a click is performed with a simulated gesture interaction. Gesture simulation allows the click to be treated within the "active interaction" state by browsers and it will allow certain restricted operations (e.g opening a new window, starting a media capture etc.) which will otherwise be blocked by the direct click. See more details - [User Activation](https://developer.mozilla.org/en-US/docs/Web/Security/User_activation). NOTE: gesture simulation may be slow and unreliable if the screen has animation or is in the middle of a re-layout operation. |

#### Returns

`void`

***

### SetValue()

> **SetValue**(`selector`, `value`): `void`

Use this function to set a value of an input on the underlying page
User will need to identify the element using the selector.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `selector` | [`Selector`](#selector) |  |
| `value` | `string` |  |

#### Returns

`void`

***

### WaitWhile()

> **WaitWhile**(`condition`, `options`?): `void`

Use this function to check for a condition and keep waiting until it is NO longer true. Default poll interval is 500ms and timeout is 60s. 
You can provide custom timeout and polling interval, if needed. Custom polling interval must be within 300ms and 5s. Custom timeout must be within 1s and 600s

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `condition` | () => `boolean` | Condition to check periodically (via polling). You must return a boolean value. Returning `true` will continue to wait the operation, while `false` will end waiting. |
| `options`? | `object` |  |
| `options.pollInterval`? | `number` | - |
| `options.timeout`? | `number` | - |

#### Returns

`void`

## Interfaces

### ARIANode

Describes a node in the [ARIA](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA) accessibility tree

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| `checked?` | `boolean` \| `"mixed"` | Whether the checkbox is checked, or in a [mixed state](https://www.w3.org/TR/wai-aria-practices/examples/checkbox/checkbox-2/checkbox-2.html). |
| `description?` | `string` | An additional human readable description of the node. |
| `invalid?` | `string` | Whether and in what way this node's value is invalid. |
| `level?` | `number` | The level of a heading. |
| `multiselectable?` | `boolean` | Whether more than one child can be selected. |
| `name?` | `string` | A human readable name for the node. |
| `nodeId` | `string` \| `number` | A unique identifier for the node |
| `role` | `string` | The [role](https://www.w3.org/TR/wai-aria/#usage_intro) of the node. |
| `value?` | `string` \| `number` | The current value of the node. |
