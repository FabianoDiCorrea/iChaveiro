import { db, type PaymentMachine, type Profile, type MachineRate } from './db';

export async function saveMachine(machine: Omit<PaymentMachine, 'id'>, id?: number) {
  if (!machine.name.trim()) throw new Error('Informe o nome da maquininha.');
  for (const rate of machine.rates) {
    if (rate.configured && (rate.percent === undefined || rate.percent < 0 || !Number.isFinite(rate.percent) || (rate.fixedCents || 0) < 0)) throw new Error('Confira as tarifas configuradas.');
  }
  return db.transaction('rw', db.paymentMachines, db.managementAudit, async () => {
    const next = { ...machine, name: machine.name.trim() };
    const idOut = id ? (await db.paymentMachines.update(id, next), id) : await db.paymentMachines.add(next);
    await db.managementAudit.add({ at: new Date(), entity: 'maquininha', entityId: idOut, action: id ? 'editar tarifas' : 'cadastrar', after: next });
    return idOut;
  });
}

export async function setDefaultMachine(profile: Profile, machineId?: number) {
  if (!machineId) { await db.managementSettings.delete(`defaultMachine:${profile}`); return; }
  const machine = await db.paymentMachines.get(machineId);
  if (!machine || !machine.active || machine.ownerProfile !== profile) throw new Error('A maquininha padrão precisa estar ativa e pertencer ao perfil.');
  await db.managementSettings.put({ key: `defaultMachine:${profile}`, value: machineId, updatedAt: new Date() });
}

export const rateFor = (machine: PaymentMachine | undefined, method: MachineRate['method'], installments = 1) => machine?.rates.find(rate => rate.method === method && (rate.installment || 1) === installments && rate.configured);
export const feeCents = (grossCents: number, rate: MachineRate) => Math.round(grossCents * (rate.percent || 0) / 100) + (rate.fixedCents || 0);

export async function deactivateMachine(id: number) {
  await db.transaction('rw', db.paymentMachines, db.managementSettings, db.managementAudit, async () => {
    const old = await db.paymentMachines.get(id);
    if (!old) throw new Error('Maquininha não encontrada.');
    await db.paymentMachines.update(id, { active: false });
    for (const profile of ['chaveiro', 'fabiano'] as const) if (Number((await db.managementSettings.get(`defaultMachine:${profile}`))?.value) === id) await db.managementSettings.delete(`defaultMachine:${profile}`);
    await db.managementAudit.add({ at: new Date(), entity: 'maquininha', entityId: id, action: 'desativar', before: old, after: { ...old, active: false } });
  });
}
