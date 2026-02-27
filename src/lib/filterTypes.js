/**
 * Flat filter system with operators between conditions
 * Simpler than hierarchical groups - just conditions with AND/OR between them
 */

/**
 * Flat filter config: list of conditions with operators between them
 * Example: [condition1, AND, condition2, OR, condition3]
 */
export const OPERATOR_LABELS = {
  equals: 'Equals',
  not_equals: 'Not Equals',
  contains: 'Contains',
  not_contains: 'Does Not Contain',
  starts_with: 'Starts With',
  ends_with: 'Ends With',
  greater_than: 'Greater Than',
  less_than: 'Less Than',
  greater_than_or_equal: 'Greater Than or Equal',
  less_than_or_equal: 'Less Than or Equal',
  between: 'Between',
  in_list: 'In List',
  is_blank: 'Is Blank',
  is_not_blank: 'Is Not Blank',
};

// Operators that require no value input
export const NO_VALUE_OPERATORS = ['is_blank', 'is_not_blank'];

// Operators that require two value inputs
export const TWO_VALUE_OPERATORS = ['between'];

// Operators that require a list input
export const LIST_OPERATORS = ['in_list'];

// Operators suitable for different field types
export const STRING_OPERATORS = [
  'equals',
  'not_equals',
  'contains',
  'not_contains',
  'greater_than',
  'less_than',
  'starts_with',
  'ends_with',
  'is_blank',
  'is_not_blank',
];

export const NUMBER_OPERATORS = [
  'equals',
  'not_equals',
  'greater_than',
  'less_than',
  'greater_than_or_equal',
  'less_than_or_equal',
  'between',
  'is_blank',
  'is_not_blank',
];

export const DATE_OPERATORS = [
  'equals',
  'not_equals',
  'greater_than',
  'less_than',
  'greater_than_or_equal',
  'less_than_or_equal',
  'between',
  'is_blank',
  'is_not_blank',
];
