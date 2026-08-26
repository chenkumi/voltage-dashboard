export const parseFileName = (text: string) => {
    const comps = text.split('/');
    const lastComp = comps[comps.length - 1];
    const separ = lastComp.lastIndexOf('.');
    if (separ !== -1) {
        const name = lastComp.substring(0, separ);
        const ext = lastComp.substring(separ + 1);
        return { name, ext };
    }

    return { name: lastComp, ext: '' };
};
