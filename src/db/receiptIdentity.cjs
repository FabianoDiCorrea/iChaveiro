function printedCustomerName(receiptName, pickupName) {
  const name = typeof receiptName === 'string' ? receiptName.trim() : '';
  const pickup = typeof pickupName === 'string' ? pickupName.trim() : '';
  return name || pickup || undefined;
}

module.exports = { printedCustomerName };
