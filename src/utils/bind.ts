// 手写bind
function MyBind(context: any, ...args: any) {
  if (typeof this !== "function") {
    throw new Error("this is not a function");
  }

  context = context || window;
  const self = this;

  return function Fn() {
    if (this instanceof Fn) {
      return new self(...args, ...arguments);
    }

    return self.apply(context, [...args, ...arguments]);
  };
}

// 手写call
function MyCall(context: any, ...args: any) {
  if (typeof this !== "function") {
    throw new Error("this is not a function");
  }

  context = context || window;
  let fn = Symbol("fn");
  context[fn] = this;

  const result = context[fn](...args[1]);
  delete context[fn];

  return result;
}

// 手写apply
function MyApply(context: any, args?: any) {
  if (typeof this !== "function") {
    throw new Error("this is not a function");
  }

  context = context || window;
  let fn = Symbol("fn");

  context[fn] = this;

  const result = args?.length ? context[fn](...args[1]) : context[fn]();

  delete context[fn];
  return result;
}

// 深拷贝
function deepClone(obj: any, hash = new WeakMap()): any {
  if (typeof obj !== "object" || obj === null) {
    return obj;
  }

  // 解决循环引用问题
  if (hash.has(obj)) {
    return hash.get(obj);
  } else {
    hash.set(obj, obj);
  }

  let cloneObj: any = Array.isArray(obj) ? [] : {};

  for (let key in obj) {
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
