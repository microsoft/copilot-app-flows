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
| `options.choices` | `string`[] | - |
| `options.description`? | `string` | - |
| `options.label` | `string` | - |
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

> **Select**(`selector`): `void`

Use this function to perform a click of a button, switch to a tab and other click interactions on an element. 
User will need to identify the element by a name which is specified in the selector.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `selector` | [`Selector`](#selector) |  |

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
