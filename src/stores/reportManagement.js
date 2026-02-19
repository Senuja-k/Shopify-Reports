import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { saveReport, getReports, deleteReportFromSupabase, getReportByShareLink } from '@/lib/supabase-utils';
import { auth } from '@/lib/supabase';
import { useOrganization } from '@/stores/organizationStore';

// Simple hash function for passwords (not cryptographically secure - for demo purposes)
const hashPassword = (password) => {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
};

// Generate unique share link
const generateShareLink = () => {
  return 'report_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

export const useReportManagement = create()(
  persist(
    (set, get) => ({
      reports: [],
      isLoading: false,
      
      loadReports: async () => {
        const session = await auth.getSession();
        const user = session.data.session?.user;
        if (!user) {
          set({ reports: [] });
          return;
        }

        const organizationId = useOrganization.getState().activeOrganizationId;
        if (!organizationId) {
          set({ reports: [] });
          return;
        }
        
        set({ isLoading: true });
        try {
          const reports = await getReports(user.id, organizationId);
          set({
            reports: reports,
            isLoading: false,
          });
        } catch (error) {
          console.error('Failed to load reports:', error);
          set({ isLoading: false });
          throw error;
        }
      },
      
      createReport: async (report) => {
        const session = await auth.getSession();
        const user = session.data.session?.user;
        if (!user) throw new Error('User not authenticated');

        const organizationId = useOrganization.getState().activeOrganizationId;
        if (!organizationId) throw new Error('No active organization selected');
        
        set({ isLoading: true });
        try {
          const now = new Date().toISOString();
          const newReport = {
            ...report,
            id: 'report_' + Date.now() + '_' + Math.random().toString(36).substring(7),
            shareLink: generateShareLink(),
            password: hashPassword(report.password),
            createdAt: now,
            updatedAt: now,
            organizationId: organizationId,
          };
          
          await saveReport(user.id, organizationId, newReport);
          
          set((state) => ({
            reports: [...state.reports, newReport],
            isLoading: false,
          }));
          
          return newReport;
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      deleteReport: async (reportId) => {
        
        const session = await auth.getSession();
        const user = session.data.session?.user;
        if (!user) {
          console.error('[reportManagement] deleteReport: User not authenticated');
          throw new Error('User not authenticated');
        }

        const organizationId = useOrganization.getState().activeOrganizationId;
        if (!organizationId) {
          console.error('[reportManagement] deleteReport: No active organization');
          throw new Error('No active organization selected');
        }
        
        
        set({ isLoading: true });
        try {
          await deleteReportFromSupabase(user.id, organizationId, reportId);
          
          set((state) => ({
            reports: state.reports.filter((r) => r.id !== reportId),
            isLoading: false,
          }));
        } catch (error) {
          console.error('[reportManagement] deleteReport error:', error);
          set({ isLoading: false });
          throw error;
        }
      },

      updateReport: async (reportId, updates) => {
        const session = await auth.getSession();
        const user = session.data.session?.user;
        if (!user) throw new Error('User not authenticated');

        const organizationId = useOrganization.getState().activeOrganizationId;
        if (!organizationId) throw new Error('No active organization selected');
        
        set({ isLoading: true });
        try {
          const updatedReport = {
            ...updates,
            updatedAt: new Date().toISOString(),
            password: updates.password ? hashPassword(updates.password) : undefined,
          };
          
          // Remove undefined password field to avoid overwriting
          if (updatedReport.password === undefined) {
            delete updatedReport.password;
          }
          
          set((state) => ({
            reports: state.reports.map((r) =>
              r.id === reportId
                ? {
                    ...r,
                    ...updatedReport,
                  }
                : r
            ),
            isLoading: false,
          }));
          
          // Save to Supabase
          const reportToSave = get().reports.find((r) => r.id === reportId);
          if (reportToSave) {
            await saveReport(user.id, organizationId, reportToSave);
          }
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      getReportById: (reportId) => {
        return get().reports.find((r) => r.id === reportId);
      },

      getReportByShareLink: (shareLink) => {
        return get().reports.find((r) => r.shareLink === shareLink);
      },

      verifyReportPassword: (reportId, password) => {
        const report = get().getReportById(reportId);
        if (!report) return false;
        return hashPassword(password) === report.password;
      },
    }),
    {
      name: 'report-management',
    }
  )
);
