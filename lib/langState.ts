// The language currently shown, readable from anywhere (non-React code, API wrappers).
let cur = 'en';
export const getLang = () => cur;
export const setLangState = (l: string) => { cur = l; };
