// 手写bind
export function MyBind(this: any, context: any, ...args: any) {
  if (typeof this !== "function") {
    throw new Error("this is not a function");
  }

  context = context || window;
  const self = this;

  return function Fn(this: any) {
    if (this instanceof Fn) {
      return new self(...args, ...arguments);
    }

    return self.apply(context, [...args, ...arguments]);
  };
}

// 手写call
export function MyCall(this: any, context: any, ...args: any) {
  if (typeof this !== "function") {
    throw new Error("this is not a function");
  }

  context = context || window;
  const fn = Symbol("fn");
  context[fn] = this;

  const result = context[fn](...args[1]);
  delete context[fn];

  return result;
}

// 手写apply
export function MyApply(this: any, context: any, args?: any) {
  if (typeof this !== "function") {
    throw new Error("this is not a function");
  }

  context = context || window;
  const fn = Symbol("fn");

  context[fn] = this;

  const result = args?.length ? context[fn](...args[1]) : context[fn]();

  delete context[fn];
  return result;
}

// 深拷贝
export function deepClone(obj: any, hash = new WeakMap()): any {
  if (typeof obj !== "object" || obj === null) {
    return obj;
  }

  // 解决循环引用问题
  if (hash.has(obj)) {
    return hash.get(obj);
  } else {
    hash.set(obj, obj);
  }

  const cloneObj: any = Array.isArray(obj) ? [] : {};

  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      if (typeof obj[key] === "object") {
        cloneObj[key] = deepClone(obj[key]);
      } else {
        cloneObj[key] = obj[key];
      }
    }
  }

  return cloneObj;
}

// 手写new原理
function MyNew(constructor: any, ...args: any) {
  const obj = {};

  obj.__proto__ = constructor.prototype;

  const res = constructor.call(obj, ...args);

  return res instanceof Object ? res : obj;
}

function debounce(fn: () => void, wait: number) {
  let timer: any = null;

  return function () {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      fn.call(this, ...arguments);
      clearTimeout(timer);
      timer = null;
    }, wait);
  };
}

function throttle(fn: () => void, delay: number) {
  let timer: any = null;

  return function () {
    if (!timer) {
      timer = setTimeout(() => {
        fn.call(this, ...arguments);
        clearTimeout(timer);
        timer = null;
      }, delay);
    }
  };
}
