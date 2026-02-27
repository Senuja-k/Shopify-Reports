import { useEffect, useMemo, useState, useRef } from 'react';
import { SimpleHeader } from '@/components/dashboard/SimpleHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useOrganization } from '@/stores/organizationStore';
import { useAuth } from '@/stores/authStore.jsx';
import { toast } from '@/hooks/use-toast';
import { Users, Plus, Trash2, Shield, User, AlertTriangle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export function Organizations() {
  const { user, isAuthenticated } = useAuth();
  const {
    organizations,
    activeOrganizationId,
    setActiveOrganization,
    createOrganization,
    deleteOrganization,
    loadOrganizations,
    loadMembers,
    members,
    addMemberByEmail,
    updateMemberRole,
    removeMember,
    isLoading,
  } = useOrganization();

  const [newOrgName, setNewOrgName] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState('member');
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [isDeletingOrg, setIsDeletingOrg] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      loadOrganizations();
    }
  }, [isAuthenticated, loadOrganizations]);

  useEffect(() => {
    if (activeOrganizationId) {
      loadMembers(activeOrganizationId);
    }
  }, [activeOrganizationId, loadMembers]);

  // Reload page when user switches back to this tab (avoids stale data)
  const _wasHidden = useRef(false);
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        _wasHidden.current = true;
      } else if (document.visibilityState === 'visible' && _wasHidden.current) {
        _wasHidden.current = false;
        window.location.reload();
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const activeOrg = useMemo(
    () => organizations.find((org) => org.id === activeOrganizationId) || null,
    [organizations, activeOrganizationId]
  );

  const isAdmin = activeOrg?.role === 'admin';

  const handleCreateOrganization = async () => {
    if (!newOrgName.trim()) {
      toast({
        title: 'Organization name required',
        description: 'Please enter a name for your organization.',
        variant: 'destructive',
      });
      return;
    }

    setIsCreatingOrg(true);
    try {
      await createOrganization(newOrgName.trim());
      setNewOrgName('');
      toast({
        title: 'Organization created',
        description: 'Your new organization is ready.',
      });
    } catch (error) {
      toast({
        title: 'Failed to create organization',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsCreatingOrg(false);
    }
  };

  const handleAddMember = async () => {
    if (!activeOrganizationId) return;
    if (!memberEmail.trim()) {
      toast({
        title: 'Email required',
        description: 'Enter a user email to add them to this organization.',
        variant: 'destructive',
      });
      return;
    }

    setIsAddingMember(true);
    try {
      await addMemberByEmail(activeOrganizationId, memberEmail.trim(), memberRole);
      setMemberEmail('');
      setMemberRole('member');
      toast({
        title: 'Member added',
        description: 'The user has been added to this organization.',
      });
    } catch (error) {
      toast({
        title: 'Failed to add member',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsAddingMember(false);
    }
  };

  const handleRoleChange = async (userId, role) => {
    if (!activeOrganizationId) return;
    try {
      await updateMemberRole(activeOrganizationId, userId, role);
      toast({
        title: 'Role updated',
        description: 'Member role has been updated.',
      });
    } catch (error) {
      toast({
        title: 'Failed to update role',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleRemoveMember = async (userId) => {
    if (!activeOrganizationId) return;
    try {
      await removeMember(activeOrganizationId, userId);
      toast({
        title: 'Member removed',
        description: 'The user has been removed from this organization.',
      });
    } catch (error) {
      toast({
        title: 'Failed to remove member',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteOrganization = async () => {
    if (!activeOrganizationId) return;
    setIsDeletingOrg(true);
    try {
      await deleteOrganization(activeOrganizationId);
      toast({
        title: 'Organization deleted',
        description: 'The organization and all its data have been permanently deleted.',
      });
    } catch (error) {
      toast({
        title: 'Failed to delete organization',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsDeletingOrg(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SimpleHeader title="Organizations" subtitle="Manage your workspaces and members" showHomeButton />
      <div className="container mx-auto py-6 px-4 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Your organizations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-2">
                <Label htmlFor="org-select">Active organization</Label>
                <Select
                  value={activeOrganizationId || undefined}
                  onValueChange={(value) => setActiveOrganization(value)}
                >
                  <SelectTrigger id="org-select">
                    <SelectValue placeholder="Select organization" />
                  </SelectTrigger>
                  <SelectContent>
                    {organizations.map((org) => (
                      <SelectItem key={org.id} value={org.id}>
                        {org.name} {org.role === 'admin' ? '• Admin' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 space-y-2">
                <Label htmlFor="org-name">Create new organization</Label>
                <div className="flex gap-2">
                  <Input
                    id="org-name"
                    placeholder="Acme Inc"
                    value={newOrgName}
                    onChange={(e) => setNewOrgName(e.target.value)}
                    disabled={isCreatingOrg}
                  />
                  <Button onClick={handleCreateOrganization} disabled={isCreatingOrg} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Create
                  </Button>
                </div>
              </div>
            </div>

            {/* Delete Organization Button - Only for admins */}
            {activeOrganizationId && isAdmin && (
              <div className="pt-4 border-t">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Delete Organization</p>
                    <p className="text-xs text-muted-foreground">
                      Permanently delete this organization and all its data (stores, products, reports).
                    </p>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm" disabled={isDeletingOrg} className="gap-2">
                        <Trash2 className="h-4 w-4" />
                        Delete Organization
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                          <AlertTriangle className="h-5 w-5 text-destructive" />
                          Delete Organization
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete <strong>{activeOrg?.name}</strong>?
                          This action cannot be undone. All stores, products, reports, and member associations will be permanently deleted.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleDeleteOrganization}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          {isDeletingOrg ? 'Deleting...' : 'Delete Organization'}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Organization members
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!activeOrganizationId ? (
              <p className="text-sm text-muted-foreground">Select an organization to manage its members.</p>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-[2fr,1fr,auto]">
                  <div className="space-y-2">
                    <Label htmlFor="member-email">Invite member by email</Label>
                    <Input
                      id="member-email"
                      placeholder="member@example.com"
                      value={memberEmail}
                      onChange={(e) => setMemberEmail(e.target.value)}
                      disabled={!isAdmin || isAddingMember}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="member-role">Role</Label>
                    <Select
                      value={memberRole}
                      onValueChange={(value) => setMemberRole(value)}
                      disabled={!isAdmin || isAddingMember}
                    >
                      <SelectTrigger id="member-role">
                        <SelectValue placeholder="Role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="member">Member</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button
                      onClick={handleAddMember}
                      disabled={!isAdmin || isAddingMember}
                      className="gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      Add
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  {members.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No members yet.</p>
                  ) : (
                    members.map((member) => (
                      <div
                        key={member.user_id}
                        className="flex flex-col gap-3 rounded-lg border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <div className="font-medium text-sm">{member.email}</div>
                          <div className="text-xs text-muted-foreground">
                            Joined {new Date(member.created_at).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {isAdmin ? (
                            <Select
                              value={member.role}
                              onValueChange={(value) => handleRoleChange(member.user_id, value)}
                              disabled={member.user_id === user?.id}
                            >
                              <SelectTrigger className="h-8 w-[140px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="admin">
                                  <span className="flex items-center gap-2">
                                    <Shield className="h-4 w-4" /> Admin
                                  </span>
                                </SelectItem>
                                <SelectItem value="member">
                                  <span className="flex items-center gap-2">
                                    <User className="h-4 w-4" /> Member
                                  </span>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-xs text-muted-foreground">{member.role}</span>
                          )}
                          {isAdmin && member.user_id !== user?.id && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRemoveMember(member.user_id)}
                              className="gap-2"
                            >
                              <Trash2 className="h-4 w-4" />
                              Remove
                            </Button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {!isAdmin && (
                  <p className="text-xs text-muted-foreground">
                    Only organization admins can add members or change roles.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {isLoading && (
          <p className="text-sm text-muted-foreground">Loading organization data...</p>
        )}
      </div>
    </div>
  );
}
