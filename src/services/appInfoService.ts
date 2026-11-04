import { AppInfo, appInfoRepository } from '../repositories/appInfoRepository';

export const appInfoService = {
  async fetchAppInfo(): Promise<AppInfo> {
    return appInfoRepository.getAppInfo();
  },
};
