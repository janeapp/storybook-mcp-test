## Styling

Do not hardcode px values for layout and spacing – use the Burrito design tokens.

Example:

```ts
import { vars } from '@janeapp/burrito-design-system'
```

## Forms

Always add `noValidate` to a `<form>` element to suppress HTML form validation.