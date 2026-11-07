// Everything you sell lives in this file.
// 1) CHARTS: one size chart per garment type (crewneck, hoodie, pants...).
// 2) PRODUCTS: each product points to one chart. The size popup then shows that product's chart
//    and recommends sizes from it.

const CURRENCY = "EGP";

const CHARTS = {
  crewneck: {
    title: "Premium oversized crewneck",
    columns: ["Width", "Length"],              // measurement names, in cm, taken flat
    sizes: [
      // name, measures (same order as columns), weight = average body weight range in kg
      { name: "S",   measures: [56, 69], weight: [50, 65] },
      { name: "M",   measures: [58, 70], weight: [65, 75] },
      { name: "L",   measures: [62, 73], weight: [75, 85] },
      { name: "XL",  measures: [64, 74], weight: [85, 95] },
      { name: "2XL", measures: [66, 76], weight: [95, 105] },
    ],
  },

  // Add another garment type by copying the block above. Example (remove the // marks):
  // hoodie: {
  //   title: "Heavyweight hoodie",
  //   columns: ["Width", "Length", "Sleeve"],
  //   sizes: [
  //     { name: "M", measures: [60, 70, 62], weight: [65, 75] },
  //     { name: "L", measures: [64, 73, 64], weight: [75, 85] },
  //   ],
  // },
};

const PRODUCTS = [
  // To add a product, copy this example, remove the // marks and fill it in.
  // {
  //   id: "stealth-tee",              // lowercase, no spaces. Used in the page link.
  //   name: "Stealth Tee",
  //   price: 650,
  //   chart: "crewneck",              // must match a name in CHARTS above
  //   images: ["images/stealth-tee-1.jpg", "images/stealth-tee-2.jpg"],
  //   description: "Heavyweight cotton. Oversized fit.",
  // },
];
