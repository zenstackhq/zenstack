import process from 'node:process';
import os from 'node:os';
import fs from 'node:fs';
export const isWsl = () => {
	if (process.platform !== 'linux') {
		return false;
	}
    
	if (os.release().toLowerCase().includes('microsoft')) {
		return true;
	}

	try {
		return fs.readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft');
	} catch {
		return false;
	}
};