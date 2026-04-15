-- Allow authenticated users to delete beta test findings
CREATE POLICY "Allow authenticated delete on beta_test_findings"
ON public.beta_test_findings
FOR DELETE
TO authenticated
USING (true);

-- Allow admins to delete a2a activity
CREATE POLICY "Admins can delete activity"
ON public.a2a_activity
FOR DELETE
TO authenticated
USING (true);