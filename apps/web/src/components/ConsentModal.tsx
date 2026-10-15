import React from "react";
import { ShieldAlert, CheckCircle2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export const ConsentModal: React.FC = () => {
  const { consentAcknowledged, acknowledgeConsent } = useAuth();

  if (consentAcknowledged) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
        <div className="flex items-center space-x-3 text-amber-500 dark:text-amber-400">
          <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/50">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Workplace Recording Policy Notice
          </h2>
        </div>

        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          TaskCatch is designed for personal work productivity to capture instructions without manual note-taking.
        </p>

        <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3.5 text-xs text-slate-600 dark:text-slate-400 space-y-2 border border-slate-200 dark:border-slate-800">
          <p className="font-semibold text-slate-800 dark:text-slate-200">
            Mandatory Compliance Notice:
          </p>
          <ul className="list-disc pl-4 space-y-1">
            <li>Recording other people in conversations requires their awareness and explicit consent.</li>
            <li>Adhere to your employer and company data privacy, confidentiality, and recording policies.</li>
            <li>Audio files are stored locally on your personal machine and are not uploaded to third-party clouds.</li>
          </ul>
        </div>

        <button
          onClick={acknowledgeConsent}
          className="w-full py-2.5 px-4 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-medium text-sm flex items-center justify-center space-x-2 transition-all shadow-md active:scale-98"
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>I Understand &amp; Agree</span>
        </button>
      </div>
    </div>
  );
};
