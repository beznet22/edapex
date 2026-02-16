export enum AttributeEnum {
    Poor = 1,
    Fair,
    Good,
    VeryGood,
    Excellent,
}

export const AttributeRemark = {
    1: "Poor",
    2: "Fair",
    3: "Good",
    4: "Very Good",
    5: "Excellent",
} as const;
