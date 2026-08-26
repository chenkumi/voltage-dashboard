class Memory {
    _storage: Map<string, any> = new Map();

    public async load(key: string): Promise<any> {
        return this._storage.get(key);
    }

    public async save(key: string, value: any) {
        this._storage.set(key, value);
    }
}

export const memory = new Memory();