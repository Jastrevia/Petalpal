declare module "*.module.css" {
  const classes: Record<string, string>;
  export default classes;
}

declare module "*.css";

declare module "*.webm" {
  const src: any;
  export default src;
}

declare module "*.webp" {
  const src: any;
  export default src;
}
