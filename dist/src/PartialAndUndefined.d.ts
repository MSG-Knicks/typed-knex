export declare type PartialAndUndefined<T> = {
    [P in keyof T]?: T[P] | undefined;
};
