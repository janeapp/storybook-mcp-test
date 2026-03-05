# Burrito Design System (@janeapp/burrito-design-system)

Jane's React component library. Use Burrito components for all UI when working in
a React context. Human-browsable docs: https://burrito-design-system.jane.qa/

## Required setup

`BurritoProvider` must wrap any subtree using Burrito components.
Omitting it breaks all component styling silently.

```tsx
import { BurritoProvider } from '@janeapp/burrito-design-system'

<BurritoProvider>
  <YourApp />
</BurritoProvider>
```

## Imports

```tsx
import { Button, PrimaryButton, TextInput, FormField, Modal, useModal, vars } from '@janeapp/burrito-design-system'
import { StarIcon } from '@janeapp/burrito-design-system/icons'
```

## Components and usage

### Buttons

Four named exports — pick by intent, not by styling props:

- `Button` — secondary/default action
- `PrimaryButton` — primary call-to-action
- `CriticalButton` — destructive actions (delete, remove)
- `PlainButton` — low-emphasis, minimal styling
- `IconButton` — icon-only; requires an accessible `aria-label`
- `ButtonGroup` — groups buttons with consistent spacing
- `UnstyledButton` — unstyled base for custom clickable elements

```tsx
<Button onClick={handleCancel}>Cancel</Button>
<PrimaryButton onClick={handleSubmit}>Save</PrimaryButton>
<CriticalButton onClick={handleDelete}>Delete account</CriticalButton>
```

### Form inputs — always use FormField or Fieldset wrappers

`FormField` wraps a single input. `Fieldset` wraps a group of checkboxes or radios.
Burrito inputs do not accept `label` or `error` as props — use composition.

```tsx
// Single input
<FormField>
  <FormField.Label>Email</FormField.Label>
  <FormField.HelperText>We'll never share this.</FormField.HelperText>
  <TextInput name="email" value={value} onChange={handleChange} required />
  <FormField.Error>Valid email required.</FormField.Error>
</FormField>

// Checkbox/radio group
<Fieldset>
  <Fieldset.Legend>Notifications</Fieldset.Legend>
  <Checkbox value="email" checked={emailChecked} onChange={handleChange}>Email</Checkbox>
  <Checkbox value="sms" checked={smsChecked} onChange={handleChange}>SMS</Checkbox>
  <Fieldset.Error>Select at least one.</Fieldset.Error>
</Fieldset>

// Select
<FormField>
  <FormField.Label>Country</FormField.Label>
  <Select value={value} onChange={handleChange} placeholder="Choose a country">
    <Select.Option value="ca">Canada</Select.Option>
    <Select.Option value="us">United States</Select.Option>
  </Select>
</FormField>
```

Input components: `TextInput`, `TextArea`, `NumberInput`, `SearchInput`, `Select`, `Checkbox`, `Radio`

### Modal

```tsx
import { Modal, Button, PrimaryButton, useModal } from '@janeapp/burrito-design-system'

const { state, triggerProps, modalProps } = useModal()

<Button {...triggerProps}>Open</Button>
<Modal state={state} {...modalProps} size="md">
  <Modal.Header>
    <Modal.Title>Confirm</Modal.Title>
    <Modal.CloseButton onClick={state.close} />
  </Modal.Header>
  <Modal.Content>Are you sure?</Modal.Content>
  <Modal.Footer>
    <Button onClick={state.close}>Cancel</Button>
    <PrimaryButton onClick={handleConfirm}>Confirm</PrimaryButton>
  </Modal.Footer>
</Modal>
```

Props: `size` (`md` | `lg`), `isDismissDisabled`, `zIndex`.

### Menu

```tsx
import { Menu, Button, useMenu } from '@janeapp/burrito-design-system'

const { menuProps, triggerProps } = useMenu()

<Button isMenuButton {...triggerProps}>Options</Button>
<Menu {...menuProps} onAction={(key) => handleAction(key)}>
  <Menu.Item key="edit">Edit</Menu.Item>
  <Menu.Item key="duplicate">Duplicate</Menu.Item>
  <Menu.DestructiveItem key="delete">Delete</Menu.DestructiveItem>
</Menu>
```

### Toast

Imperative API — call anywhere; place `<Toaster />` once at the app root.

```tsx
import { Toaster, showToast } from '@janeapp/burrito-design-system'

// App root (once):
<Toaster />

// Anywhere:
showToast({ content: 'Saved!', tone: 'success' })
showToast({ content: 'Something went wrong.', tone: 'critical' })
```

### Card, Alert, Badge, and others

```tsx
// Card with optional sub-sections
<Card>
  <Card.Content>Body</Card.Content>
  <Card.Footer>Actions</Card.Footer>
</Card>

// Alert
<Alert tone="critical">Your session is about to expire.</Alert>

// Badge
<Badge tone="success">Active</Badge>

// Other available components:
// Heading, Text, Link, Divider, Tooltip, SkeletonBar, DataTable
```

## Key patterns

## Styling

Do not hardcode px values for layout and spacing – use the Burrito design tokens.

Example:

```ts
import { vars } from '@janeapp/burrito-design-system'
```

### Prefer controlled inputs

```tsx
<TextInput value={name} onChange={(e) => setName(e.target.value)} />
// Not: <TextInput defaultValue="Jane" />
```

### Boolean prop naming

Custom Burrito props: `is`/`has`/`can`/`should` prefix → `hasError`, `isDismissDisabled`, `isFullWidth`
Native HTML props: no prefix → `disabled`, `required`, `readOnly`

### Shared prop conventions

- `tone`: `neutral` | `brand` | `critical` | `warning` | `success` | `discovery`
- `size`: `sm` | `md` | `lg`

## Forms

Always add `noValidate` to a `<form>` element to suppress HTML form validation.

## When Burrito doesn't have the component you need

1. **Check first** — Burrito may have it under a different name (`UnstyledButton` for custom
   clickables, `Fieldset` for grouped inputs, etc.)
2. **Use React Aria** for custom interactive components — it's already a dependency and handles
   keyboard interaction, ARIA attributes, and focus management correctly
3. **Use Burrito design tokens** so custom UI matches the design language:

```tsx
import { vars } from '@janeapp/burrito-design-system'

vars.global.color.brand[50]      // mid-tone brand color
vars.global.color.neutral[10]    // light grey
vars.alias.background.color.default    // page background
vars.alias.text.color.default          // default text color
vars.global.size['4x']          // 16px (base unit: 4px, scale: 1x–13x)
vars.global.typography.fontSize.md
```
