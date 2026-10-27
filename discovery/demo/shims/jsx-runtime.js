// Demo build only: automatic JSX runtime on top of the UMD React global.
const R = window.React;
export function jsx(type, props, key) {
  return R.createElement(type, key === undefined ? props : { ...props, key });
}
export const jsxs = jsx;
export const jsxDEV = jsx;
export const Fragment = R.Fragment;
